import { expect, test } from "bun:test";
import { parseGradient, resolvePaint, paintWithin, type Paint } from "../../../src/css/paint.ts";
import { radialGeometry } from "../../../src/css/radial-gradient.ts";

const colors = "rgb(0,0,0),rgb(255,255,255)";
function radial(prelude = "") {
  const paint = parseGradient(`radial-gradient(${prelude ? `${prelude},` : ""}${colors})`);
  if (paint.kind !== "radial") throw new Error(`Expected radial paint: ${prelude}`);
  return paint;
}

test("default ellipse meets the farthest corner with the box aspect ratio", () => {
  const geometry = radialGeometry(radial(), 240, 80);
  expect(geometry.center).toEqual([120, 40]);
  expect(geometry.radii[0]).toBeCloseTo(120 * Math.SQRT2, 9);
  expect(geometry.radii[1]).toBeCloseTo(40 * Math.SQRT2, 9);
  expect(radialGeometry(radial("circle"), 240, 80).radii).toEqual([Math.hypot(120, 40), Math.hypot(120, 40)]);
});

test.each([
  ["ellipse closest-side at 25% 75%", [60, 20]],
  ["ellipse farthest-side at 25% 75%", [180, 60]],
  ["ellipse closest-corner at 25% 75%", [60 * Math.SQRT2, 20 * Math.SQRT2]],
  ["ellipse farthest-corner at 25% 75%", [180 * Math.SQRT2, 60 * Math.SQRT2]],
  ["circle closest-side at 25% 75%", [20, 20]],
  ["circle farthest-side at 25% 75%", [180, 180]],
  ["circle closest-corner at 25% 75%", [Math.hypot(60, 20), Math.hypot(60, 20)]],
] as const)("%s retains its independent ending-shape extent", (prelude, expected) => {
  const actual = radialGeometry(radial(prelude), 240, 80).radii;
  expect(actual[0]).toBeCloseTo(expected[0], 9);
  expect(actual[1]).toBeCloseTo(expected[1], 9);
});

test("absolute centers and explicit mixed-unit ellipse radii resolve on the live box", () => {
  const paint = radial("ellipse 25% 30px at 40px 75%");
  expect(radialGeometry(paint, 240, 80)).toEqual({ center: [40, 60], radii: [60, 30] });
  expect(radialGeometry(paint, 400, 160)).toEqual({ center: [40, 120], radii: [100, 30] });
  expect(radialGeometry(radial("40px circle at top left"), 240, 80)).toEqual({ center: [0, 0], radii: [40, 40] });
  expect(radialGeometry(radial("at bottom"), 240, 80).center).toEqual([120, 80]);
});

test("radial pixel stops normalize against the horizontal ellipse radius", () => {
  const paint = parseGradient("radial-gradient(ellipse farthest-side, rgb(0,0,0) 0px, rgb(255,255,255) 60px)");
  const resolved = resolvePaint(paint, 240, 80) as Extract<Paint, { kind: "radial" }>;
  expect(resolved.stops.at(-1)?.pos).toBe(0.5);
});

test("text cropping preserves the host ending-shape radii and absolute center", () => {
  const paint = radial("ellipse closest-side at 40px 75%");
  const cropped = paintWithin(paint, { x: 10, y: 20, w: 240, h: 80 }, { x: 30, y: 30, w: 100, h: 20 });
  if (cropped.kind !== "radial") throw new Error("Expected cropped radial paint");
  expect(radialGeometry(cropped, 100, 20)).toEqual({ center: [20, 50], radii: [40, 20] });
});

test.each(["circle 25%", "ellipse 30px", "circle 30px 40px", "ellipse calc(50% - 2px) 40px", "at left 10px top 20px", "garbage", "ellipse -4px 20px"])("unresolved radial prelude %s stays explicitly unsupported", prelude => {
  expect(parseGradient(`radial-gradient(${prelude},${colors})`).kind).toBe("unsupported");
});

test.each(["linear-gradient(90deg", "radial-gradient(80px", "conic-gradient(from 0deg"])("%s transition hints are not silently deleted", prefix => {
  const paint = parseGradient(`${prefix},rgb(0,0,0),30%,rgb(255,255,255))`);
  expect(paint).toMatchObject({ kind: "unsupported", reason: "unresolved gradient color stops or transition hints" });
});

test("computed-color parser declines unresolved names and empty stop lists", () => {
  expect(parseGradient("conic-gradient(from 90deg, red, blue)").kind).toBe("unsupported");
  expect(parseGradient("radial-gradient(ellipse, rgb(0,0,0))").kind).toBe("unsupported");
});
