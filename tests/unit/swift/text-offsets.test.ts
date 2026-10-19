import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { command } from "../../../tools/verify/process.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest(
  "relative glyph paint moves while adjacent glyphs and text size stay fixed",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-text-offset-"));
    try {
      await Bun.write(join(dir, "Runtime.swift"), SWIFT_RUNTIME);
      await Bun.write(
        join(dir, "main.swift"),
        `import SwiftUI
import AppKit
for shift in [false, true] {
    let content = Text.markswiftRuns([
        Text("A").foregroundStyle(.green),
        Text("B").foregroundStyle(.red).customAttribute(MarkswiftTextOffset(x: shift ? 12 : 0, y: shift ? 6 : 0)),
        Text("C").foregroundStyle(.blue)
    ]).font(.system(size: 24)).textRenderer(MarkswiftOffsetTextRenderer(x: 12, y: 6))
      .fixedSize().padding(20).background(.white)
    let renderer = ImageRenderer(content: content)
    renderer.scale = 2
    let image = renderer.cgImage!
    let bitmap = NSBitmapImageRep(cgImage: image)
    var bounds = Array(repeating: [Int.max, Int.max, 0, 0], count: 3)
    for y in 0..<bitmap.pixelsHigh { for x in 0..<bitmap.pixelsWide {
        let c = bitmap.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        let channels = [c.greenComponent, c.redComponent, c.blueComponent]
        for k in 0..<3 where channels[k] > 0.4 && channels[k] > channels[(k+1)%3] + 0.3 && channels[k] > channels[(k+2)%3] + 0.3 {
            bounds[k][0] = min(bounds[k][0], x); bounds[k][1] = min(bounds[k][1], y)
            bounds[k][2] = max(bounds[k][2], x); bounds[k][3] = max(bounds[k][3], y)
        }
    }}
    print(String(data: try! JSONSerialization.data(withJSONObject: [[image.width, image.height]] + bounds), encoding: .utf8)!)
}
`,
      );
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"])).trim();
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
          "-default-isolation",
          "MainActor",
          "-o",
          join(dir, "probe"),
          join(dir, "Runtime.swift"),
          join(dir, "main.swift"),
        ],
        dir,
        120_000,
      );
      const [rest, shifted] = (await command([join(dir, "probe")]))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as number[][]);
      expect(shifted![0]).toEqual(rest![0]);
      expect(shifted![1]).toEqual(rest![1]);
      expect(shifted![3]).toEqual(rest![3]);
      expect(rest![2]![0]).toBeLessThan(1000);
      expect(shifted![2]!.map((v, i) => v - rest![2]![i]!)).toEqual([24, 12, 24, 12]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  120_000,
);
