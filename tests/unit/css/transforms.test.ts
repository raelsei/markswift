import { describe, expect, test } from "bun:test";
import { cssTransform, parseTransform } from "../../../src/css/index.ts";
import type { Transform2D } from "../../../src/model/values.ts";

describe("parseTransform", () => {
  test("rotation matrix (regression)", () => {
    expect(parseTransform("matrix(0.7071, 0.7071, -0.7071, 0.7071, 10, 20)")).toEqual({
      rotate: 45,
      scaleX: 1,
      scaleY: 1,
      tx: 10,
      ty: 20,
    });
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
    expect(parseTransform("matrix(1, 0, 0.36397, 1, 0, 0)")).toEqual({
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      tx: 0,
      ty: 0,
      skewX: 20,
    });
  });
  test("skewY(20deg) as Chrome serialises it", () => {
    expect(parseTransform("matrix(1, 0.36397, 0, 1, 0, 0)")).toEqual({
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      tx: 0,
      ty: 0,
      skewY: 20,
    });
  });
  test("rotate(30deg) skewX(15deg) scale(2, 3) decomposes back", () => {
    expect(parseTransform("matrix(1.73205, 1, -0.803848, 3, 0, 0)")).toEqual({
      rotate: 30,
      scaleX: 2,
      scaleY: 3,
      tx: 0,
      ty: 0,
      skewX: 15,
    });
  });
  test("affine matrix3d decomposes like matrix", () => {
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)")).toEqual({
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      tx: 10,
      ty: 20,
    });
    expect(
      parseTransform("matrix3d(0.707107, 0.707107, 0, 0, -0.707107, 0.707107, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)"),
    ).toEqual(parseTransform("matrix(0.707107, 0.707107, -0.707107, 0.707107, 10, 20)"));
  });
  test("3D matrices flatten to their x/y affine part and say so", () => {
    // translateZ(5px): no visible change, still marked.
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 5, 1)")).toEqual({
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      tx: 10,
      ty: 20,
      flattened: true,
    });
    // rotateX(30deg): the y axis squeezes to cos 30°.
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 0.866025, 0.5, 0, 0, -0.5, 0.866025, 0, 0, 0, 0, 1)")).toEqual({
      rotate: 0,
      scaleX: 1,
      scaleY: 0.87,
      tx: 0,
      ty: 0,
      flattened: true,
    });
    expect(parseTransform("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -0.001, 0, 0, 0, 1)")).toMatchObject({
      flattened: true,
    });
  });
  test.each(["none", "translate(10px)"])("unknown → undefined: %s", (input) =>
    expect(parseTransform(input)).toBeUndefined(),
  );
  // `R(rotate)·Kx(skewX)·Ky(skewY)·S(scaleX, scaleY)` as `[a, b, c, d]`, composed exactly like `affineModifier`.
  const recompose = (t: Transform2D): number[] => {
    const rad = Math.PI / 180;
    const cos = Math.cos(t.rotate * rad),
      sin = Math.sin(t.rotate * rad);
    const kx = Math.tan((t.skewX ?? 0) * rad),
      ky = Math.tan((t.skewY ?? 0) * rad);
    const mul = (p: number[], q: number[]) => [
      p[0]! * q[0]! + p[2]! * q[1]!,
      p[1]! * q[0]! + p[3]! * q[1]!,
      p[0]! * q[2]! + p[2]! * q[3]!,
      p[1]! * q[2]! + p[3]! * q[3]!,
    ];
    return mul(mul(mul([cos, sin, -sin, cos], [1, 0, kx, 1]), [1, ky, 0, 1]), [t.scaleX, 0, 0, t.scaleY]);
  };
  test.each([
    [-1, 0, 0, 1],
    [1, 0, 0, -1],
    [-2, 0, 0, 3],
    [0, -1, -1, 0],
  ])("negative determinant keeps its flip: matrix(%d, %d, %d, %d)", (a, b, c, d) => {
    const t = parseTransform(`matrix(${a}, ${b}, ${c}, ${d}, 4, 5)`)!;
    expect(t.scaleX * t.scaleY).toBeLessThan(0);
    recompose(t).forEach((v, i) => {
      expect(v).toBeCloseTo([a, b, c, d][i]!, 2);
    });
  });
  test("rotate 180° (positive determinant) is not a flip", () => {
    const t = parseTransform("matrix(-1, 0, 0, -1, 0, 0)")!;
    expect(t.scaleX).toBeGreaterThan(0);
    expect(t.scaleY).toBeGreaterThan(0);
    recompose(t).forEach((v, i) => {
      expect(v).toBeCloseTo([-1, 0, 0, -1][i]!, 2);
    });
  });
});

describe("cssTransform", () => {
  const id = { rotate: 0, scaleX: 1, scaleY: 1, tx: 0, ty: 0 };
  test("rotate about the transform-origin", () => {
    expect(cssTransform({ rotate: "45deg", "transform-origin": "20px 20px" }, 40, 40)).toEqual({
      transform: { rotate: 45, scaleX: 1, scaleY: 1, tx: 0, ty: 0, origin: [20, 20] },
      losses: [],
    });
  });
  test("% translate resolves against the border box", () => {
    expect(cssTransform({ translate: "-50% 8px" }, 40, 40)).toEqual({
      transform: { ...id, tx: -20, ty: 8 },
      losses: [],
    });
  });
  test("calc() translate component", () => {
    expect(cssTransform({ translate: "0px calc(-50% - 2px)" }, 10, 10)).toEqual({
      transform: { ...id, ty: -7 },
      losses: [],
    });
  });
  test("translate · rotate · scale compose in CSS order", () => {
    expect(cssTransform({ translate: "0px -50%", rotate: "180deg", scale: "0.5 1" }, 40, 40).transform).toEqual({
      rotate: 180,
      scaleX: 0.5,
      scaleY: 1,
      tx: 0,
      ty: -20,
    });
  });
  test("translate composes with transform", () => {
    expect(cssTransform({ translate: "10px", transform: "matrix(1, 0, 0, 1, 5, 0)" }, 40, 40).transform).toEqual({
      ...id,
      tx: 15,
    });
  });
  test("negative scale is a flip, not a rotation", () => {
    expect(cssTransform({ scale: "-1 1" }, 24, 24).transform).toEqual({ ...id, scaleX: -1 });
  });
  test("3D rotate is reported and skipped", () => {
    expect(cssTransform({ rotate: "x 45deg" }, 40, 40)).toEqual({
      losses: [{ level: "unmapped", feature: "rotate", message: "rotate x 45deg (3D)" }],
    });
  });
  test("translate z is dropped and reported", () => {
    expect(cssTransform({ translate: "10px 20px 30px" }, 40, 40)).toEqual({
      transform: { ...id, tx: 10, ty: 20 },
      losses: [{ level: "approximated", feature: "translate", message: "translate z dropped" }],
    });
  });
  test("all none is no transform", () => {
    expect(cssTransform({ scale: "none", rotate: "none", translate: "none", transform: "none" }, 40, 40)).toEqual({
      losses: [],
    });
  });
});
