import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { counterText } from "../../../src/css/index.ts";
import type { CounterStyle } from "../../../src/model/semantic.ts";
import counterRuntime from "../../../src/swift/runtime/counter.swift" with { type: "text" };
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

const STYLES: Array<[CounterStyle, string]> = [
  ["decimal", "decimal"],
  ["decimal-leading-zero", "decimalLeadingZero"],
  ["lower-alpha", "lowerAlpha"],
  ["upper-alpha", "upperAlpha"],
  ["lower-roman", "lowerRoman"],
  ["upper-roman", "upperRoman"],
];
const VALUES = [-3, 0, 1, 4, 9, 10, 14, 26, 27, 52, 702, 703, 1994, 3999, 4000];

nativeTest(
  "markswiftCounter prints what counterText prints",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-counter-"));
    try {
      const prints = STYLES.flatMap(([, swift]) => VALUES.map((v) => `print(markswiftCounter(${v}, .${swift}))`));
      await Bun.write(join(directory, "counter.swift"), counterRuntime);
      await Bun.write(join(directory, "main.swift"), prints.join("\n"));
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
          join(directory, "counter"),
          join(directory, "counter.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const out = (await command([join(directory, "counter")], directory, 30_000)).trimEnd().split("\n");
      expect(out).toEqual(STYLES.flatMap(([style]) => VALUES.map((v) => counterText(v, style))));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300_000,
);

nativeTest(
  "runtime typechecks a rendered image run and an enumerated counter ForEach on iOS 18",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-counter-typecheck-"));
    try {
      await Bun.write(
        join(directory, "CounterFixture.swift"),
        `import SwiftUI\n\n${SWIFT_RUNTIME}\n
struct CounterFixture: View {
    struct Row: Identifiable { let id: String; var name: String }
    var rows: [Row] = [Row(id: "a", name: "Plan"), Row(id: "b", name: "Build")]
    var body: some View {
        VStack {
            Text.markswiftRuns([Text(Image.markswiftRendered(width: 10, height: 10) { Circle().fill(Color.blue) }).baselineOffset(2), Text(verbatim: " x")])
            ForEach(Array(rows.enumerated()), id: \\.element.id) { index, row in
                Text(verbatim: "\\(markswiftCounter(1 + index, .upperRoman)). \\(row.name)")
            }
        }
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
  120_000,
);
