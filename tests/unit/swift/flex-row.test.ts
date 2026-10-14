import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { solveFlexRow } from "../../../src/analysis/flex-row.ts";
import type { FlexItem } from "../../../src/model/semantic.ts";
import flexRowRuntime from "../../../src/swift/runtime/flex-row.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "flex-row runtime implements SwiftUI Layout for every alignment and basis kind",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-flex-row-typecheck-"));
    try {
      await Bun.write(
        join(directory, "FlexRowFixture.swift"),
        `import SwiftUI\n\n${flexRowRuntime}\n
struct FlexRowFixture: View {
    var body: some View {
        VStack {
            MarkswiftFlexRow(items: [.init(grow: 1.0, shrink: 0.0, basis: 0.0), .init(grow: 2.0, shrink: 0.0, basis: 0.0)], spacing: 8.0) {
                Color.red.frame(maxWidth: .infinity, maxHeight: .infinity)
                Color.blue.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            MarkswiftFlexRow(items: [.init(grow: 1.0, shrink: 1.0, basis: nil), .init(grow: 0.0, shrink: 1.0, basis: 150.0)], spacing: 8.0, align: .start) {
                Text("content").frame(maxWidth: .infinity)
                Color.green.frame(maxWidth: .infinity).frame(height: 20)
            }
            MarkswiftFlexRow(items: [.init(grow: 0.0, shrink: 1.0, basis: nil), .init(grow: 0.0, shrink: 1.0, basis: nil)], spacing: 4.0, align: .center) {
                Text("a")
                Text("b")
            }
            MarkswiftFlexRow(items: [.init(grow: 1.0, shrink: 1.0, basis: 10.0), .init(grow: 1.0, shrink: 1.0, basis: nil)], spacing: 0.0, align: .end) {
                Text("c")
                Text("d")
            }
            MarkswiftFlexRow(items: [.init(grow: 0.0, shrink: 2.0, basis: 160.0, min: 88.0, max: 200.0, inset: 10.0), .init(grow: 0.0, shrink: 1.0, basis: 0.0, fraction: 0.25)], spacing: 12.0) {
                Text("e")
                Text("f")
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

const items = (...g: Array<[number, number]>): FlexItem[] => g.map(([grow, shrink]) => ({ grow, shrink, basis: null }));
// core-alpha's browser-proven CSS cases (#grow, #shrink, #partial; tests/integration/allocated-layout.test.ts) at
// the row widths of 390 / 320 / 500 viewports, plus a percentage basis.
const grow: FlexItem[] = [
  { grow: 1, shrink: 1, basis: 0 },
  { grow: 2, shrink: 1, basis: 0, max: 130 },
  { grow: 1, shrink: 1, basis: 0 },
];
const shrink: FlexItem[] = [
  { grow: 0, shrink: 1, basis: 160, inset: 10 },
  { grow: 0, shrink: 2, basis: 160, inset: 10, min: 88 },
  { grow: 0, shrink: 1, basis: 160, inset: 10 },
];
const partial: FlexItem[] = Array(3).fill({ grow: 0.25, shrink: 1, basis: 40 });
const percent: FlexItem[] = [
  { grow: 0, shrink: 1, basis: 0, fraction: 0.25 },
  { grow: 1, shrink: 1, basis: 10, fraction: 0.5 },
];
const CASES: Array<{ items: FlexItem[]; bases: number[]; width: number; gap: number }> = [
  { items: items([1, 0], [2, 0]), bases: [0, 0], width: 340, gap: 8 }, // P1
  { items: items([1, 1], [1, 1]), bases: [59, 144], width: 340, gap: 8 }, // P3
  { items: items([0, 1], [0, 1], [0, 1]), bases: [150, 150, 150], width: 340, gap: 8 }, // P4
  { items: items([0.25, 1], [0.25, 1]), bases: [100, 50], width: 300, gap: 8 }, // Σgrow 0.5
  { items: items([0, 1], [0, 1]), bases: [100, 50], width: 300, gap: 8 }, // no growth, free > 0
  { items: items([0, 1], [0, 0]), bases: [200, 200], width: 300, gap: 10 }, // one px item does not shrink
  { items: items([1, 1], [1, 1]), bases: [150, 150], width: 310, gap: 10 }, // free exactly 0
  { items: items([0, 100], [0, 1]), bases: [10, 300], width: 100, gap: 0 }, // frozen at 0
  { items: items([0, 1], [0, 1], [0, 1]), bases: [200, 40, 50], width: 270, gap: 8 }, // P5 at 320
  { items: items([0, 0.25], [0, 0.25], [0, 0]), bases: [150, 150, 150], width: 340, gap: 8 }, // Σshrink 0.5
  ...[358, 288, 468].flatMap((width) => [
    { items: grow, bases: [0, 0, 0], width, gap: 12 },
    { items: shrink, bases: [160, 160, 160], width, gap: 12 },
    { items: partial, bases: [40, 40, 40], width, gap: 12 },
    { items: percent, bases: [0, 10], width, gap: 12 },
  ]),
];
const swiftItem = (i: FlexItem) =>
  `.init(grow: ${i.grow}, shrink: ${i.shrink}, basis: nil${(["min", "max", "inset", "fraction"] as const).map((k) => (i[k] === undefined ? "" : `, ${k}: ${i[k]}`)).join("")})`;

nativeTest(
  "MarkswiftFlexRow.widths agrees with solveFlexRow",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-flex-row-parity-"));
    try {
      await Bun.write(join(directory, "flex-row.swift"), `import SwiftUI\n\n${flexRowRuntime}`);
      const calls = CASES.map(
        (c) =>
          `    MarkswiftFlexRow.widths(width: ${c.width}, items: [${c.items.map(swiftItem).join(", ")}], bases: [${c.bases.join(", ")}], spacing: ${c.gap}),`,
      );
      await Bun.write(
        join(directory, "main.swift"),
        `import SwiftUI\n\nlet results: [[CGFloat]] = [\n${calls.join("\n")}\n]\nfor w in results { print("[" + w.map { "\\(Double($0))" }.joined(separator: ",") + "]") }\n`,
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
          join(directory, "flex-row.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const lines = (await command([join(directory, "parity")], directory, 30_000)).trim().split("\n");
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((c, i) => {
        const swift = JSON.parse(lines[i]!) as number[];
        const ts = solveFlexRow(c.items, c.bases, c.width, c.gap);
        expect(swift).toHaveLength(ts.length);
        for (const [j, w] of swift.entries()) expect(Math.abs(w - ts[j]!)).toBeLessThanOrEqual(0.001);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);
