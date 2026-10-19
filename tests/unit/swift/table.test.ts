/** `MarkswiftTable` compiles (iOS 18, Swift 6) and its column solver agrees with `solveTableColumns`. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { solveTableColumns } from "../../../src/analysis/table.ts";
import type { TableColumn } from "../../../src/model/semantic.ts";
import tableRuntime from "../../../src/swift/runtime/table.swift" with { type: "text" };
import tracksRuntime from "../../../src/swift/runtime/tracks.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
// The grid-cell key and modifier live in tracks.swift.
const RUNTIME = `${tracksRuntime}\n\n${tableRuntime}`;

nativeTest(
  "table runtime implements SwiftUI Layout with bands, spans and fixed columns",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-table-typecheck-"));
    try {
      await Bun.write(
        join(directory, "TableFixture.swift"),
        `import SwiftUI\n\n${RUNTIME}\n
struct TableFixture: View {
    var body: some View {
        VStack {
            MarkswiftTable(widths: [80, 90, 90], heights: [26, 26], hSpacing: 3, vSpacing: 5, bands: 1) {
                Color.gray.markswiftGridCell(column: 1, row: 1, columnSpan: 3)
                Text("a").frame(maxWidth: .infinity, maxHeight: .infinity).markswiftGridCell(column: 1, row: 1, columnSpan: 2)
                Text("b").markswiftGridCell(column: 3, row: 1, rowSpan: 2)
            }
            MarkswiftTable(widths: [60, 38, 91], heights: [20], fixed: [.px(60), .percent(0.1, plus: 10), .auto]) {
                Text("x").markswiftGridCell(column: 1, row: 1)
                Text("y").markswiftGridCell(column: 2, row: 1)
                Text("z").markswiftGridCell(column: 3, row: 1)
            }
        }
        .frame(width: 390)
    }
}
`,
      );
      const check = await typecheck(directory);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

const px = (n: number): TableColumn => ({ kind: "px", px: n });
const pct = (fraction: number, plus: number): TableColumn => ({ kind: "percent", fraction, plus });
const auto: TableColumn = { kind: "auto" };
const PROBE = [88.688, 93.641, 93.672];
/** solveTableColumns cases of tests/unit/analysis/table.test.ts: [fixed, width, spacing, captured widths]. */
const CASES: Array<[TableColumn[] | undefined, number | undefined, number, number[]]> = [
  [[px(60), pct(0.1, 10), auto, auto], 300, 4, [0, 0, 0, 0]],
  [[px(60), pct(0.1, 10), auto], 276, 4, [0, 0, 0]],
  [[px(60), px(70)], 300, 4, [0, 0]],
  [[px(58), auto], 298, 0, [0, 0]],
  [[px(210), px(210), auto], 300, 4, [0, 0, 0]],
  [[px(50), pct(0.3, 8), auto], 298, 0, [0, 0, 0]],
  [undefined, undefined, 3, PROBE],
  [undefined, 288.001, 3, PROBE],
  [undefined, 200, 3, PROBE],
];

const swiftColumn = (c: TableColumn) =>
  c.kind === "auto" ? ".auto" : c.kind === "px" ? `.px(${c.px})` : `.percent(${c.fraction}, plus: ${c.plus})`;
const swiftCall = ([fixed, width, spacing, widths]: (typeof CASES)[number]) =>
  `MarkswiftTable.columns(width: ${width ?? "nil"}, widths: [${widths.join(", ")}], spacing: ${spacing}, fixed: ${fixed ? `[${fixed.map(swiftColumn).join(", ")}]` : "nil"})`;

nativeTest(
  "MarkswiftTable.columns agrees with solveTableColumns",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-table-parity-"));
    try {
      await Bun.write(join(directory, "runtime.swift"), `import SwiftUI\n\n${RUNTIME}`);
      await Bun.write(
        join(directory, "main.swift"),
        `import SwiftUI\n\nlet results: [[CGFloat]] = [\n${CASES.map((c) => `    ${swiftCall(c)},`).join("\n")}\n]\nfor cols in results { print("[" + cols.map { "\\(Double($0))" }.joined(separator: ",") + "]") }\n`,
      );
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"], undefined, 15_000)).trim();
      await command(
        [
          "xcrun",
          "swiftc",
          "-sdk",
          sdk,
          "-target",
          "arm64-apple-macos15.0",
          "-swift-version",
          "6",
          "-strict-concurrency=complete",
          "-default-isolation",
          "MainActor",
          "-o",
          join(directory, "parity"),
          join(directory, "runtime.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const lines = (await command([join(directory, "parity")], directory, 30_000)).trim().split("\n");
      expect(lines).toHaveLength(CASES.length);
      for (const [i, [fixed, width, spacing, widths]] of CASES.entries()) {
        const swift = JSON.parse(lines[i]!) as number[];
        const ts = solveTableColumns(width, widths, spacing, fixed);
        expect(swift).toHaveLength(ts.length);
        for (const [j, w] of swift.entries()) expect(Math.abs(w - ts[j]!)).toBeLessThanOrEqual(0.001);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);
