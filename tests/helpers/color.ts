import { expect } from "bun:test";
import type { Color } from "../../src/css/color.ts";

export function expectClose(c: Color | undefined, [r, g, b, a]: [number, number, number, number]): void {
  expect(c).toBeDefined();
  expect(Math.abs(c!.r * 255 - r)).toBeLessThanOrEqual(1);
  expect(Math.abs(c!.g * 255 - g)).toBeLessThanOrEqual(1);
  expect(Math.abs(c!.b * 255 - b)).toBeLessThanOrEqual(1);
  expect(Math.abs(c!.a - a)).toBeLessThanOrEqual(1 / 255);
}
