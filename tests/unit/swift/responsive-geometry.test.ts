import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { command } from "../../../tools/verify/process.ts";
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "percentage translation responds to both dimensions without moving its capture-size origin",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-responsive-"));
    try {
      await Bun.write(join(dir, "Runtime.swift"), SWIFT_RUNTIME);
      await Bun.write(
        join(dir, "main.swift"),
        `import SwiftUI
let effect = MarkswiftResponsiveTranslation(width: 200, height: 100, xWidth: -0.38, xHeight: 0.25, yWidth: 0.5, yHeight: -0.5)
for size in [CGSize(width: 200, height: 100), CGSize(width: 300, height: 100), CGSize(width: 200, height: 200), CGSize(width: 300, height: 200)] {
    let t = effect.effectValue(size: size)
    print("[\\(t.m31),\\(t.m32)]")
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
      );
      const values = (await command([join(dir, "probe")]))
        .trim()
        .split("\n")
        .map((v) => JSON.parse(v));
      expect(values).toEqual([
        [0, 0],
        [-38, 50],
        [25, -50],
        [-13, 0],
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  120_000,
);

nativeTest(
  "responsive SVG object-fit cover emits size-dependent geometry that compiles on iOS",
  async () => {
    const { compileLayout } = await import("../../../src/compiler/index.ts");
    const { box, doc } = await import("../../helpers/tables.ts");
    const { typecheck } = await import("../../../tools/verify/typecheck.ts");
    const source =
      "data:image/svg+xml," +
      encodeURIComponent('<svg viewBox="0 0 100 160"><rect width="100" height="160" fill="red"/></svg>');
    const image = box(
      "img",
      { x: 0, y: 0, w: 200, h: 100 },
      { display: "block", "object-fit": "cover", "object-position": "100% 50%" },
      [],
      { src: source },
      "100%",
    );
    const result = compileLayout(doc(image), { name: "Cover", mode: "app" });
    expect(result.code).toContain("GeometryReader { box in");
    expect(result.code).toContain("max(box.size.width / 100.0, box.size.height / 160.0)");
    expect(result.code).toContain(".clipped()");
    const dir = await mkdtemp(join(tmpdir(), "markswift-cover-"));
    try {
      for (const [name, content] of Object.entries(result.files)) await Bun.write(join(dir, name), content);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
