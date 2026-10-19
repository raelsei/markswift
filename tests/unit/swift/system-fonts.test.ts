import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertHtml } from "../../../src/index.ts";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest(
  "installed system axes retain intermediate width, weight, optical size and grade",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-system-axes-"));
    try {
      await Bun.write(join(dir, "runtime.swift"), SWIFT_RUNTIME);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
      await Bun.write(
        join(dir, "main.swift"),
        `import SwiftUI
import CoreText
let font = markswiftSystemFont(size: 20, weight: 650, design: .default, axes: ["wdth": 80, "opsz": 24, "GRAD": 600])
let values = CTFontCopyVariation(font) as? [Int: CGFloat] ?? [:]
for (tag, id) in [("wdth", 0x77647468), ("wght", 0x77676874), ("opsz", 0x6F70737A), ("GRAD", 0x47524144)] { print(tag, values[id] ?? -1) }
for width in [75, 80, 90] as [CGFloat] {
 let f = markswiftSystemFont(size: 20, weight: 400, design: .default, axes: ["wdth": width])
 let text = NSAttributedString(string: "Markswift typography", attributes: [NSAttributedString.Key(kCTFontAttributeName as String): f])
 print("advance", CTLineGetTypographicBounds(CTLineCreateWithAttributedString(text), nil, nil, nil))
}
`,
      );
      await command(
        [
          "xcrun",
          "swiftc",
          "-swift-version",
          "6",
          "-default-isolation",
          "MainActor",
          "-o",
          join(dir, "probe"),
          join(dir, "runtime.swift"),
          join(dir, "main.swift"),
        ],
        dir,
        240_000,
      );
      const lines = (await command([join(dir, "probe")], dir, 30_000)).trim().split("\n");
      const values = Object.fromEntries(
        lines.slice(0, 4).map((l) => {
          const [key, value] = l.split(" ");
          return [key, Number(value)];
        }),
      );
      expect(values).toEqual({ wdth: 80, wght: 650, opsz: 24, GRAD: 600 });
      const advances = lines.slice(4).map((l) => Number(l.split(" ")[1]));
      expect(advances[1]! - advances[0]!).toBeGreaterThan(1);
      expect(advances[2]! - advances[1]!).toBeGreaterThan(1);
      const reference = await convertHtml(
        `<main style="width:1000px">${[75, 80, 90]
          .map(
            (width) =>
              `<div><span style="font:20px system-ui;font-stretch:${width}%;white-space:nowrap">Markswift typography</span></div>`,
          )
          .join("")}</main>`,
        { root: "main", theme: "light" },
      );
      for (const [i, row] of reference.layout.root.children.entries())
        expect(Math.abs(row.children[0]!.bounds.w - advances[i]!)).toBeLessThan(0.1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  300_000,
);
