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
const CASES: Array<{ items: FlexItem[]; bases: number[]; width: number; gap: number }> = [
  { items: items([1, 0], [2, 0]), bases: [0, 0], width: 340, gap: 8 }, // P1
  { items: items([1, 1], [1, 1]), bases: [59, 144], width: 340, gap: 8 }, // P3
  { items: items([0, 1], [0, 1], [0, 1]), bases: [150, 150, 150], width: 340, gap: 8 }, // P4
  { items: items([0.25, 1], [0.25, 1]), bases: [100, 50], width: 300, gap: 8 }, // Σgrow 0.5
  { items: items([0, 1], [0, 1]), bases: [100, 50], width: 300, gap: 8 }, // no growth, free > 0
  { items: items([0, 1], [0, 0]), bases: [200, 200], width: 300, gap: 10 }, // one px item does not shrink
  { items: items([1, 1], [1, 1]), bases: [150, 150], width: 310, gap: 10 }, // free exactly 0
  { items: items([0, 100], [0, 1]), bases: [10, 300], width: 100, gap: 0 }, // clamped at 0
  { items: items([0, 1], [0, 1], [0, 1]), bases: [200, 40, 50], width: 270, gap: 8 }, // P5 at 320
];

nativeTest(
  "MarkswiftFlexRow.widths agrees with solveFlexRow",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-flex-row-parity-"));
    try {
      await Bun.write(join(directory, "flex-row.swift"), `import SwiftUI\n\n${flexRowRuntime}`);
      const calls = CASES.map(
        (c) =>
          `    MarkswiftFlexRow.widths(width: ${c.width}, items: [${c.items.map((i) => `.init(grow: ${i.grow}, shrink: ${i.shrink}, basis: nil)`).join(", ")}], bases: [${c.bases.join(", ")}], spacing: ${c.gap}),`,
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
