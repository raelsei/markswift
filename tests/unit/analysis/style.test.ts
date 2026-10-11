import { expect, test } from "bun:test";
import { styleOf } from "../../../src/analysis/style.ts";
import { shapeExpr, swiftBlend } from "../../../src/swift/paint.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { Diagnostic } from "../../../src/model/semantic.ts";

const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
function node(radius: string): LayoutNode {
  return {
    tag: "div",
    attrs: {},
    bounds: { x: 0, y: 0, w: 272, h: 176 },
    children: [],
    styles: Object.fromEntries(corners.map((c) => [`border-${c}-radius`, radius])),
  };
}
test("50% corner radii on a non-square box retain an ellipse rather than a capsule", () => {
  const diagnostics: Diagnostic[] = [];
  const style = styleOf(node("50%"), diagnostics);
  expect(shapeExpr(style, 272, 176)).toBe("Ellipse()");
  expect(diagnostics).toEqual([]);
});
test("a circular pill radius still emits a capsule", () => {
  const diagnostics: Diagnostic[] = [];
  const style = styleOf(node("88px"), diagnostics);
  expect(shapeExpr(style, 272, 176)).toBe("Capsule(style: .circular)");
  expect(diagnostics).toEqual([]);
});

test("a measured box keeps paint, borders and effects together", () => {
  const styles: Record<string, string> = {
    "background-color": "rgb(255, 0, 0)",
    opacity: "0.5",
    "overflow-x": "hidden",
    filter: "blur(3px)",
    transform: "matrix(1, 0, 0, 1, 5, 6)",
    "transform-origin": "50px 40px",
    "outline-style": "solid",
    "outline-width": "1px",
    "outline-color": "rgb(0, 255, 0)",
    "outline-offset": "2px",
  };
  for (const edge of ["top", "right", "bottom", "left"]) {
    styles[`border-${edge}-style`] = "solid";
    styles[`border-${edge}-width`] = "2px";
    styles[`border-${edge}-color`] = "rgb(0, 0, 255)";
  }
  const diagnostics: Diagnostic[] = [];
  const style = styleOf(
    { tag: "main", attrs: {}, bounds: { x: 0, y: 0, w: 100, h: 80 }, children: [], styles },
    diagnostics,
  );
  expect(style.fills).toEqual([{ kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }]);
  expect(style.border).toEqual({ width: 2, color: { r: 0, g: 0, b: 1, a: 1 } });
  expect(style.opacity).toBe(0.5);
  expect(style.clip).toBe(true);
  expect(style.blur).toBe(3);
  expect(style.transform).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 5, ty: 6, origin: [50, 40] });
  expect(style.outline).toEqual({ width: 1, color: { r: 0, g: 1, b: 0, a: 1 }, style: "solid", offset: 2 });
  expect(diagnostics).toEqual([]);
});

test("an individual rotate property becomes the node's transform", () => {
  const diagnostics: Diagnostic[] = [];
  const style = styleOf(
    {
      tag: "div",
      attrs: {},
      bounds: { x: 0, y: 0, w: 40, h: 40 },
      children: [],
      styles: { rotate: "45deg", "transform-origin": "20px 20px" },
    },
    diagnostics,
  );
  expect(style.transform).toEqual({ rotate: 45, scaleX: 1, scaleY: 1, tx: 0, ty: 0, origin: [20, 20] });
  expect(diagnostics).toEqual([]);
});

test("mix-blend-mode is parsed once, in analysis; the emitter only names it", () => {
  const blendOf = (mode: string) => {
    const diagnostics: Diagnostic[] = [];
    const style = styleOf(
      { tag: "div", attrs: {}, bounds: { x: 0, y: 0, w: 40, h: 40 }, children: [], styles: { "mix-blend-mode": mode } },
      diagnostics,
    );
    return { blend: style.blend, diagnostics };
  };
  expect(blendOf("multiply")).toEqual({ blend: "multiply", diagnostics: [] });
  const bogus = blendOf("bogus");
  expect(bogus.blend).toBeUndefined();
  expect(bogus.diagnostics).toEqual([
    { level: "unmapped", feature: "mix-blend-mode", message: "mix-blend-mode bogus" },
  ]);
  expect(swiftBlend("color-dodge")).toBe(".colorDodge");
  expect(swiftBlend("normal")).toBeUndefined();
});
