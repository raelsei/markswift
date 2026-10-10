import { expect, test } from "bun:test";
import { paintExpr } from "../../../src/swift/paint.ts";
import type { Paint } from "../../../src/css/index.ts";

const linear = (angle: number): Paint => ({ kind: "linear", angle, stops: [{ color: { r: 1, g: 0, b: 0, a: 1 }, pos: 0 }, { color: { r: 0, g: 0, b: 1, a: 1 }, pos: 1 }] });

test.each([
  [45, 100, 100, "startPoint: UnitPoint(x: 0.0, y: 1.0), endPoint: UnitPoint(x: 1.0, y: 0.0)"],
  [90, 200, 40, "startPoint: UnitPoint(x: 0.0, y: 0.5), endPoint: UnitPoint(x: 1.0, y: 0.5)"],
  [180, 200, 40, "startPoint: UnitPoint(x: 0.5, y: 0.0), endPoint: UnitPoint(x: 0.5, y: 1.0)"],
  [45, 200, 100, "startPoint: UnitPoint(x: 0.125, y: 1.25), endPoint: UnitPoint(x: 0.875, y: -0.25)"],
  // The magic `to right top` angle of a 200×100 box: the line ends on the far corners' perpendiculars.
  [26.57, 200, 100, "startPoint: UnitPoint(x: 0.3, y: 1.3), endPoint: UnitPoint(x: 0.7, y: -0.3)"],
])("linear %d° in %d×%d ends on the CSS gradient line", (angle, w, h, points) => {
  expect(paintExpr(linear(angle), w, h, { mode: "app" })).toContain(points);
});
