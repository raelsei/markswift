import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayouts } from "../../src/compiler/index.ts";
import { PAINT_GRADIENT_RUNTIME } from "../../src/swift/paint-gradient-runtime.ts";
import { PAINT_RADIAL_RUNTIME } from "../../src/swift/paint-radial-runtime.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { gradientFixture } from "../helpers/gradient-fixture.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest("the actual Swift gradient math keeps authored angles and corners across aspect changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-gradient-math-"));
  try {
    await writeFile(join(dir, "proof.swift"), `import SwiftUI\n${PAINT_GRADIENT_RUNTIME}\n${PAINT_RADIAL_RUNTIME}\n
func close(_ actual: CGFloat, _ expected: CGFloat) { precondition(abs(actual - expected) < 1e-9) }
let wide = MarkswiftCSSGradientLine.endpoints(angle: 135, size: CGSize(width: 240, height: 80))
close(wide.start.x, 1.0 / 6); close(wide.start.y, -0.5); close(wide.end.x, 5.0 / 6); close(wide.end.y, 1.5)
let square = MarkswiftCSSGradientLine.endpoints(angle: 45, size: CGSize(width: 128, height: 128))
close(square.start.x, 0); close(square.start.y, 1); close(square.end.x, 1); close(square.end.y, 0)
let cornerWide = MarkswiftCSSGradientLine.endpoints(angle: 135, corner: .bottomTrailing, size: CGSize(width: 240, height: 80))
close(cornerWide.start.x, 0.4); close(cornerWide.start.y, -0.4); close(cornerWide.end.x, 0.6); close(cornerWide.end.y, 1.4)
let cornerTall = MarkswiftCSSGradientLine.endpoints(angle: 135, corner: .bottomTrailing, size: CGSize(width: 80, height: 240))
close(cornerTall.start.x, -0.4); close(cornerTall.start.y, 0.4); close(cornerTall.end.x, 1.4); close(cornerTall.end.y, 0.6)
let empty = MarkswiftCSSGradientLine.endpoints(angle: 135, size: .zero)
precondition(empty.start == .center && empty.end == .center)
let radialWide = MarkswiftCSSRadialExtent.farthestCorner.radii(center: CGPoint(x: 120, y: 40), size: CGSize(width: 240, height: 80), ellipse: true)
close(radialWide.width, 120 * sqrt(2)); close(radialWide.height, 40 * sqrt(2))
let radialSide = MarkswiftCSSRadialExtent.closestSide.radii(center: CGPoint(x: 60, y: 60), size: CGSize(width: 240, height: 80), ellipse: true)
close(radialSide.width, 60); close(radialSide.height, 20)
let radialCircle = MarkswiftCSSRadialExtent.farthestCorner.radii(center: CGPoint(x: 120, y: 40), size: CGSize(width: 240, height: 80), ellipse: false)
close(radialCircle.width, hypot(120, 40)); close(radialCircle.height, hypot(120, 40))
let radialExplicit = MarkswiftCSSRadialExtent.explicit(.fraction(0.25), .points(30)).radii(center: .zero, size: CGSize(width: 400, height: 160), ellipse: true)
close(radialExplicit.width, 100); close(radialExplicit.height, 30)
print("gradient physical geometry passed")
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(dir, "proof.swift"), "-o", join(dir, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, code] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(code, error).toBe(0);
    expect(error).not.toContain("warning:");
    const executable = Bun.spawn([join(dir, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, runError, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, runError).toBe(0);
    expect(output).toContain("gradient physical geometry passed");
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);

nativeTest("complete numeric, corner, blended, masked, and text-gradient bundles typecheck for iOS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-gradient-sdk-"));
  try {
    const ramp = "rgb(0, 0, 0), rgb(255, 255, 255)";
    const captures = [
      gradientFixture(`linear-gradient(135deg, ${ramp})`),
      gradientFixture(`linear-gradient(to bottom right, ${ramp})`),
      gradientFixture(`linear-gradient(30deg, ${ramp})`, { "background-color": "rgb(128, 128, 128)", "background-blend-mode": "multiply",
        "mask-image": "linear-gradient(to top right, rgb(0, 0, 0), rgba(0, 0, 0, 0))" }),
      gradientFixture(`linear-gradient(to bottom right, ${ramp})`, { "background-clip": "text", color: "rgba(0, 0, 0, 0)" }),
      gradientFixture(`radial-gradient(circle at 50% 50%, ${ramp})`),
      gradientFixture(`conic-gradient(from 0deg at 50% 50%, ${ramp})`),
      gradientFixture("linear-gradient(90deg, oklab(0 0 0), oklab(1 0 0))"),
      gradientFixture(`radial-gradient(circle in oklab, ${ramp})`),
      gradientFixture(`conic-gradient(in oklab, ${ramp})`),
      gradientFixture(`radial-gradient(${ramp})`),
      gradientFixture(`radial-gradient(ellipse closest-corner at 25% 75%, ${ramp})`),
      gradientFixture(`radial-gradient(ellipse 25% 30px at 40px 75%, ${ramp})`),
      gradientFixture(`radial-gradient(40px circle at top left, ${ramp})`),
      gradientFixture(`radial-gradient(ellipse farthest-side, ${ramp})`, { "background-color": "rgb(128,128,128)", "background-blend-mode": "multiply", "mask-image": "radial-gradient(ellipse closest-side, rgb(0,0,0), rgba(0,0,0,0))" }),
    ];
    const bundle = compileLayouts(captures.flatMap((layout, index) => (["app", "fidelity"] as const).map(mode => ({
      layout, mode, name: `Gradient${index}${mode === "app" ? "App" : "Fidelity"}`,
    }))));
    for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(dir, name), source);
    const result = await typecheck(dir);
    expect(result.ok, result.output).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);
