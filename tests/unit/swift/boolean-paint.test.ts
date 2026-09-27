import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { isDrawnMarkControl } from "../../../src/swift/boolean-control.ts";
import { SWIFT_RUNTIME } from "../../../src/swift/emit.ts";
import { CONTROL_RUNTIME } from "../../../src/swift/control-runtime.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

function compile(type: "checkbox" | "radio" | "text", mode: "app" | "fidelity", theme: "light" | "dark", width = 13, disabled = true, scheme = theme as string) {
  const layout: LayoutDoc = {
    version: 1, source: "boolean-paint.html", combo: { screen: "boolean-paint", theme, demoState: "normal" },
    size: { w: 180, h: 32 }, dpr: 2, canvas: "white", fonts: [],
    root: { id: "#choice", tag: "input", attrs: { type, checked: "", ...(disabled ? { disabled: "" } : {}) },
      styles: { display: "inline-block", opacity: "0.4", ...(scheme === "legacy" ? {} : { "color-scheme": scheme }) }, bounds: { x: 0, y: 0, w: width, h: 13 }, children: [] },
  };
  return { ...compileLayout(layout, { name: `Boolean${type}${mode}${theme}${width}`, mode }), root: inferScreen(layout, "BooleanPaint").root };
}

test("drawn checked controls retain captured disabled palette in both modes and explicit themes", () => {
  for (const mode of ["app", "fidelity"] as const) for (const theme of ["light", "dark"] as const) for (const type of ["checkbox", "radio"] as const) {
    const result = compile(type, mode, theme);
    expect(result.code).toContain(`disabled: true, palette: .${theme}`);
    expect(result.code).toContain(".opacity(0.4)");
    expect(result.code.includes(".disabled(true)")).toBe(mode === "app");
    expect(isDrawnMarkControl(result.root)).toBe(true);
  }
});

test("native mark schemes follow supported CSS schemes and diagnose legacy/custom fallback", () => {
  for (const mode of ["app", "fidelity"] as const) for (const theme of ["light", "dark"] as const) {
    for (const [scheme, palette] of [["normal", "light"], ["light", "light"], ["dark", "dark"], ["only light", "light"], ["dark only", "dark"], ["light dark", theme], ["dark light only", theme]] as const) {
      const result = compile("checkbox", mode, theme, 13, true, scheme);
      expect(result.code).toContain(`disabled: true, palette: .${palette}`);
      expect(result.root.notes).toEqual([]);
    }
    const legacy = compile("radio", mode, theme, 13, true, "legacy");
    expect(legacy.code).toContain(`palette: .${theme}`);
    expect(legacy.diagnostics.flatMap(item => item.notes).join("\n")).toContain("color-scheme metadata unavailable");
    const unsupported = compile("radio", mode, theme, 13, true, "only parchment");
    expect(unsupported.code).toContain("palette: .light");
    expect(unsupported.root.notes.join("\n")).toContain("has no supported native scheme");
  }
});

test("mark renderer discriminator preserves switches and native field opacity behavior", () => {
  expect(isDrawnMarkControl(compile("checkbox", "app", "light", 27).root)).toBe(true);
  const wide = compile("checkbox", "app", "light", 28);
  expect(isDrawnMarkControl(wide.root)).toBe(false);
  expect(wide.code).toContain(".toggleStyle(.switch)");
  expect(wide.code).not.toContain(".opacity(0.4)");
  expect(isDrawnMarkControl(compile("radio", "app", "light", 28).root)).toBe(true);
  const field = compile("text", "app", "light", 100);
  expect(isDrawnMarkControl(field.root)).toBe(false);
  expect(field.code).not.toContain(".opacity(0.4)");
  expect(compile("checkbox", "app", "light", 13, false).code).toContain("disabled: false, palette: .light");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("actual native enabled mark background follows its captured CSS scheme independently of environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-enabled-mark-colors-"));
  try {
    const start = CONTROL_RUNTIME.indexOf("@MainActor struct MarkswiftMarkButtonStyle"), end = CONTROL_RUNTIME.indexOf("/// The bar a browser paints");
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    await Bun.write(join(directory, "Runtime.swift"), "import SwiftUI\n" + CONTROL_RUNTIME.slice(start, end));
    await Bun.write(join(directory, "main.swift"), `import SwiftUI
import AppKit
@MainActor func paint(_ palette: MarkswiftMarkToggleStyle.Palette, _ scheme: ColorScheme, _ mark: MarkswiftMarkToggleStyle.Mark, _ opacity: Double) -> CGImage {
    let renderer = ImageRenderer(content: Toggle(isOn: .constant(false)) { EmptyView() }
        .toggleStyle(MarkswiftMarkToggleStyle(mark: mark, tint: Color.blue, palette: palette))
        .frame(width: 13, height: 13).opacity(opacity).background(Color(.sRGB, red: 1, green: 0, blue: 0)).environment(\\.colorScheme, scheme))
    renderer.scale = 2; return renderer.cgImage!
}
func pixels(_ image: CGImage) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
    bytes.withUnsafeMutableBytes { data in
        let context = CGContext(data: data.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    }; return bytes
}
for mark in [MarkswiftMarkToggleStyle.Mark.check, .dot] {
    for palette in [MarkswiftMarkToggleStyle.Palette.light, .dark] {
        for opacity in [1.0, 0.4] {
            let light = pixels(paint(palette, .light, mark, opacity)), dark = pixels(paint(palette, .dark, mark, opacity))
            precondition(light == dark, "Native environment overrode captured CSS palette")
            if opacity == 1 {
                let center = (13 * 26 + 13) * 4, expected: UInt8 = palette == .light ? 255 : 59
                precondition(Array(light[center..<center+4]) == [expected, expected, expected, 255], "Actual opaque checkbox/radio face differs from Chromium source palette")
            }
        }
    }
}
print("actual native enabled background palettes and opacity A/B passed")
`);
    const built = await Bun.$`xcrun swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors ${join(directory, "Runtime.swift")} ${join(directory, "main.swift")} -o ${join(directory, "proof")}`.quiet().nothrow();
    expect(built.exitCode, built.stderr.toString()).toBe(0);
    const ran = await Bun.$`${join(directory, "proof")}`.quiet().nothrow(); expect(ran.exitCode, ran.stderr.toString()).toBe(0);
    expect(ran.stdout.toString()).toContain("palettes and opacity A/B passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
nativeTest("complete disabled checkbox/radio bundles compile in both modes and themes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-boolean-paint-"));
  try {
    await Bun.write(join(directory, "MarkswiftRuntime.swift"), SWIFT_RUNTIME);
    for (const mode of ["app", "fidelity"] as const) for (const theme of ["light", "dark"] as const) for (const type of ["checkbox", "radio"] as const) {
      const result = compile(type, mode, theme);
      await Bun.write(join(directory, `${type}-${mode}-${theme}.swift`), result.code);
    }
    const result = await typecheck(directory);
    expect(result.ok, result.output).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
