import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { parseGradient, type Paint } from "../../../src/css/paint.ts";
import { paintExpr } from "../../../src/swift/paint.ts";
import { gradientFixture } from "../../helpers/gradient-fixture.ts";

const ramp = "rgb(0, 0, 0), rgb(255, 255, 255)";

function endpoints(p: Paint, width: number, height: number): number[] {
  const code = paintExpr(p, width, height, { mode: "fidelity" });
  expect(code).toContain(".colorSpace(.device)");
  const match = /startPoint: UnitPoint\(x: ([^,]+), y: ([^)]+)\), endPoint: UnitPoint\(x: ([^,]+), y: ([^)]+)\)/.exec(code);
  if (!match) throw new Error(`Expected a LinearGradient ShapeStyle: ${code}`);
  return match.slice(1).map(Number);
}

test("numeric gradient ShapeStyles project CSS endpoints outside wide bounds", () => {
  expect(endpoints(parseGradient(`linear-gradient(135deg, ${ramp})`), 240, 80)).toEqual([0.167, -0.5, 0.833, 1.5]);
  expect(endpoints(parseGradient(`linear-gradient(45deg, ${ramp})`), 240, 80)).toEqual([0.167, 1.5, 0.833, -0.5]);
});

test("square diagonal ShapeStyles cover the complete CSS gradient line", () => {
  expect(endpoints(parseGradient(`linear-gradient(135deg, ${ramp})`), 128, 128)).toEqual([0, 0, 1, 1]);
  expect(endpoints(parseGradient(`linear-gradient(90deg, ${ramp})`), 240, 80)).toEqual([0, 0.5, 1, 0.5]);
});

test("corner ShapeStyles preserve the neighboring-corner midpoint on wide and tall boxes", () => {
  const p = parseGradient(`linear-gradient(to bottom right, ${ramp})`);
  expect(endpoints(p, 240, 80)).toEqual([0.4, -0.4, 0.6, 1.4]);
  expect(endpoints(p, 80, 240)).toEqual([-0.4, 0.4, 1.4, 0.6]);
});

test.each(["app", "fidelity"] as const)("%s background emission carries authored direction to live paint bounds", mode => {
  const result = compileLayout(gradientFixture(`linear-gradient(135deg, ${ramp})`), { name: "NumericGradient", mode });
  expect(result.code).toContain("MarkswiftCSSLinearGradient(stops:");
  expect(result.code).toContain("angle: 135.0)");
  expect(result.code).not.toContain("startPoint: UnitPoint");
  const corner = compileLayout(gradientFixture(`linear-gradient(to bottom right, ${ramp})`), { name: "CornerGradient", mode });
  expect(corner.code).toContain("corner: UnitPoint(x: 1.0, y: 1.0)");
});

test("blended linear layers and alpha masks use live bounds", () => {
  const result = compileLayout(gradientFixture(`linear-gradient(30deg, ${ramp})`, {
    "background-color": "rgb(200, 200, 200)", "background-blend-mode": "multiply",
    "mask-image": "linear-gradient(to top right, rgb(0, 0, 0), rgba(0, 0, 0, 0))",
  }), { name: "GradientEffects" });
  expect(result.code.match(/MarkswiftCSSLinearGradient\(stops:/g)).toHaveLength(2);
  expect(result.code).toContain(".blendMode(.multiply)");
  expect(result.code).toContain(".mask { MarkswiftCSSLinearGradient");
  expect(result.code).toContain(".init(color: Color.markswift(0.0, 0.0, 0.0, 0.0), location: 1.0)");
});

test("modern and mixed stops use a distinct diagnosed paint route from legacy sRGB", () => {
  const modern = "oklab(0 0 0), oklab(1 0 0)";
  for (const gradient of [`linear-gradient(90deg, ${modern})`, `radial-gradient(circle, ${modern})`, `conic-gradient(${modern})`]) {
    expect(paintExpr(parseGradient(gradient), 240, 80, { mode: "fidelity" })).toContain(".colorSpace(.perceptual)");
  }
  for (const mode of ["app", "fidelity"] as const) {
    const result = compileLayout(gradientFixture(`linear-gradient(90deg, ${modern})`), { name: "ModernGradient", mode });
    expect(result.code).toContain("perceptual: true");
    expect(result.diagnostics.flatMap(row => row.notes).join(" ")).toContain("CSS Oklab gradient");
  }
  const explicit = compileLayout(gradientFixture(`linear-gradient(90deg in srgb, ${modern})`), { name: "ExplicitLegacy", mode: "app" });
  expect(explicit.code).not.toContain("perceptual: true");
});

test.each(["app", "fidelity"] as const)("%s radial backgrounds retain live ending-shape size and center units", mode => {
  const result = compileLayout(gradientFixture(`radial-gradient(ellipse 25% 30px at 40px 75%, ${ramp})`), { name: "EllipseGradient", mode });
  expect(result.code).toContain("MarkswiftCSSRadialGradient(stops:");
  expect(result.code).toContain("ellipse: true, position: (.points(40.0), .fraction(0.75)), extent: .explicit(.fraction(0.25), .points(30.0))");
});

test("blended radial paint and masks use the same live geometry contract", () => {
  const result = compileLayout(gradientFixture(`radial-gradient(ellipse farthest-side, ${ramp})`, {
    "background-color": "rgb(200,200,200)", "background-blend-mode": "multiply",
    "mask-image": "radial-gradient(ellipse closest-side, rgb(0,0,0), rgba(0,0,0,0))",
  }), { name: "RadialEffects" });
  expect(result.code.match(/MarkswiftCSSRadialGradient\(stops:/g)).toHaveLength(2);
  expect(result.code).toContain("extent: .farthestSide");
  expect(result.code).toContain("extent: .closestSide");
});

test("radial text and captured pixel stop limitations remain visible in diagnostics", () => {
  const text = compileLayout(gradientFixture(`radial-gradient(${ramp})`, { "background-clip": "text", color: "rgba(0,0,0,0)" }), { name: "RadialText" });
  expect(text.diagnostics.flatMap(row => row.notes).join(" ")).toContain("elliptical radial text fill");
  const pixels = compileLayout(gradientFixture("radial-gradient(ellipse, rgb(0,0,0) 0px, rgb(255,255,255) 60px)"), { name: "PixelGradient" });
  expect(pixels.diagnostics.flatMap(row => row.notes).join(" ")).toContain("absolute gradient stop positions");
});

test.each(["linear-gradient(90deg", "radial-gradient(circle 80px at 20% 50%", "conic-gradient(from 0deg"])("%s content clipping masks a full paint field", prefix => {
  const result = compileLayout(gradientFixture(`${prefix}, ${ramp})`, {
    "background-clip": "content-box", "padding-top": "20px", "padding-right": "20px", "padding-bottom": "20px", "padding-left": "20px",
  }), { name: "ClippedGradient" });
  expect(result.code).toContain(".mask { Rectangle().padding(EdgeInsets(top: 20.0, leading: 20.0, bottom: 20.0, trailing: 20.0)) }");
  expect(result.code).not.toContain(".clipShape(Rectangle()).padding(EdgeInsets");
});

test.each([false, true])("rounded content clips subtract padding from live outer radius (blend=%s)", blend => {
  const styles: Record<string, string> = {
    "background-clip": "content-box", "padding-top": "20px", "padding-right": "20px", "padding-bottom": "20px", "padding-left": "20px",
    "border-top-left-radius": "20px", "border-top-right-radius": "20px", "border-bottom-right-radius": "20px", "border-bottom-left-radius": "20px",
  };
  if (blend) { styles["background-color"] = "rgb(180,180,180)"; styles["background-blend-mode"] = "multiply"; }
  const result = compileLayout(gradientFixture(`radial-gradient(circle 80px at 20% 50%, ${ramp})`, styles), { name: "RoundedClip" });
  expect(result.code.match(/\.mask \{ MarkswiftCSSInsetRoundClip\(radius: 20.0, inset: 20.0\) \}/g)).toHaveLength(blend ? 2 : 1);
  expect(result.code).not.toContain(".mask { RoundedRectangle(cornerRadius: 20.0");
});
