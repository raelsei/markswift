import { expect, test } from "bun:test";
import { linearGradientLine, type GradientCorner } from "../../../src/css/gradient-line.ts";

test("numeric endpoints preserve physical CSS direction, span, and corner projection at every aspect", () => {
  for (const [w, h] of [[240, 80], [80, 240], [128, 128]]) for (const angle of [0, 30, 45, 75, 90, 135, 180, 225, 270, 315]) {
    const line = linearGradientLine(angle, w!, h!);
    const vx = (line.end[0] - line.start[0]) * w!, vy = (line.end[1] - line.start[1]) * h!;
    const radians = angle * Math.PI / 180, dx = Math.sin(radians), dy = -Math.cos(radians);
    expect(vx * dy - vy * dx).toBeCloseTo(0, 9);
    expect(Math.hypot(vx, vy)).toBeCloseTo(Math.abs(w! * dx) + Math.abs(h! * dy), 9);
    const atCorner = (x: number, y: number) => ((x - line.start[0]) * w! * dx + (y - line.start[1]) * h! * dy) / line.length;
    expect(atCorner(dx >= 0 ? 0 : 1, dy >= 0 ? 0 : 1)).toBeCloseTo(0, 9);
    expect(atCorner(dx >= 0 ? 1 : 0, dy >= 0 ? 1 : 0)).toBeCloseTo(1, 9);
  }
});

test("all corner keyword directions put their neighboring corners at exactly half the ramp", () => {
  for (const [w, h] of [[240, 80], [80, 240], [128, 128]]) for (const corner of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as GradientCorner[]) {
    const line = linearGradientLine(135, w!, h!, corner);
    const [dx, dy] = line.direction;
    const projection = (x: number, y: number) => ((x - line.start[0]) * w! * dx + (y - line.start[1]) * h! * dy) / line.length;
    expect(projection(corner[0] > 0 ? 1 : 0, corner[1] > 0 ? 0 : 1)).toBeCloseTo(0.5, 9);
    expect(projection(corner[0] > 0 ? 0 : 1, corner[1] > 0 ? 1 : 0)).toBeCloseTo(0.5, 9);
  }
});

test("zero-area and invalid bounds yield finite empty geometry", () => {
  for (const [w, h] of [[0, 80], [240, 0], [-1, 20], [Infinity, 80], [20, NaN]]) {
    expect(linearGradientLine(135, w!, h!)).toEqual({ direction: [0, 0], length: 0, start: [0.5, 0.5], end: [0.5, 0.5] });
  }
});
