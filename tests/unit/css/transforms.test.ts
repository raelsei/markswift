import { describe, expect, test } from "bun:test";
import { parseTransform } from "../../../src/css/transforms.ts";


describe("parseTransform", () => {
  test("rotation matrix (regression)", () => {
    expect(parseTransform("matrix(0.7071, 0.7071, -0.7071, 0.7071, 10, 20)")).toEqual({ rotate: 45, scaleX: 1, scaleY: 1, tx: 10, ty: 20 });
  });
  test("scale-only matrix (regression, no skew keys)", () => {
    expect(parseTransform("matrix(2, 0, 0, 3, 0, 0)")).toEqual({ rotate: 0, scaleX: 2, scaleY: 3, tx: 0, ty: 0 });
    expect(parseTransform("matrix(1, 0, 0, 1, 5, -5)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 5, ty: -5 });
  });
  test("rotate + non-uniform scale has no phantom skew", () => {
    const t = parseTransform("matrix(1.73205, 1, -1.5, 2.59808, 0, 0)")!;
    expect(t.rotate).toBe(30);
    expect(t.scaleX).toBe(2);
    expect(t.scaleY).toBe(3);
    expect(t.skewX).toBeUndefined();
    expect(t.skewY).toBeUndefined();
  });
  test("skewX(20deg) as Chrome serialises it", () => {
    expect(parseTransform("matrix(1, 0, 0.36397, 1, 0, 0)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 0, ty: 0, skewX: 20 });
  });
  test("skewY(20deg) as Chrome serialises it", () => {
    expect(parseTransform("matrix(1, 0.36397, 0, 1, 0, 0)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 0, ty: 0, skewY: 20 });
  });
  test("rotate(30deg) skewX(15deg) scale(2, 3) decomposes back", () => {
    expect(parseTransform("matrix(1.73205, 1, -0.803848, 3, 0, 0)")).toEqual({ rotate: 30, scaleX: 2, scaleY: 3, tx: 0, ty: 0, skewX: 15 });
  });
  test("affine matrix3d decomposes like matrix", () => {
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 10, ty: 20 });
    expect(parseTransform("matrix3d(0.707107, 0.707107, 0, 0, -0.707107, 0.707107, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)")).toEqual(
      parseTransform("matrix(0.707107, 0.707107, -0.707107, 0.707107, 10, 20)"),
    );
  });
  test("3D matrices flatten to their x/y affine part and say so", () => {
    // translateZ(5px): no visible change, still marked.
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 5, 1)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 10, ty: 20, flattened: true });
    // rotateX(30deg): the y axis squeezes to cos 30°.
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 0.866025, 0.5, 0, 0, -0.5, 0.866025, 0, 0, 0, 0, 1)")).toEqual({ rotate: 0, scaleX: 1, scaleY: 0.87, tx: 0, ty: 0, flattened: true });
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -0.001, 0, 0, 0, 1)")).toMatchObject({ flattened: true });
  });
  test.each(["none", "translate(10px)"])("unknown → undefined: %s", (input) => expect(parseTransform(input)).toBeUndefined());
});
