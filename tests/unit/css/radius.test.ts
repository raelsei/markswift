import { describe, expect, test } from "bun:test";
import { parseRadius, parseRadiusXY } from "../../../src/css/radius.ts";


describe("parseRadius", () => {
  test("px value and elliptical pair keep today's first-value result", () => {
    expect(parseRadius("26px")).toBe(26);
    expect(parseRadius("24px 12px")).toBe(24);
    expect(parseRadius(undefined)).toBe(0);
  });
  test("percentage resolves against the reference", () => {
    expect(parseRadius("50%", 120)).toBe(60);
    expect(parseRadius("50%")).toBe(0);
  });
  test("elliptical pairs resolve each axis against its own reference", () => {
    expect(parseRadiusXY("24px 12px", 200, 100)).toEqual([24, 12]);
    expect(parseRadiusXY("50%", 200, 100)).toEqual([100, 50]);
    expect(parseRadiusXY("50% 12px", 200, 100)).toEqual([100, 12]);
    expect(parseRadiusXY("10% 20%", 200, 100)).toEqual([20, 20]);
    expect(parseRadiusXY("0", 200, 100)).toEqual([0, 0]);
  });
});
