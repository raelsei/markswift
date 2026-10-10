import { describe, expect, test } from "bun:test";
import { parseRadiusXY } from "../../../src/css/index.ts";


describe("parseRadiusXY", () => {
  test("elliptical pairs resolve each axis against its own reference", () => {
    expect(parseRadiusXY("24px 12px", 200, 100)).toEqual([24, 12]);
    expect(parseRadiusXY("50%", 200, 100)).toEqual([100, 50]);
    expect(parseRadiusXY("50% 12px", 200, 100)).toEqual([100, 12]);
    expect(parseRadiusXY("10% 20%", 200, 100)).toEqual([20, 20]);
    expect(parseRadiusXY("0", 200, 100)).toEqual([0, 0]);
    expect(parseRadiusXY(undefined, 200, 100)).toEqual([0, 0]);
  });
});
