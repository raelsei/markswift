import { expect, test } from "bun:test";
import { styleOf } from "../../../src/analysis/style.ts";
import { shapeExpr } from "../../../src/swift/paint.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
function node(radius: string): LayoutNode {
  return { tag: "div", attrs: {}, bounds: { x: 0, y: 0, w: 272, h: 176 }, children: [], styles: Object.fromEntries(corners.map(c => [`border-${c}-radius`, radius])) };
}
test("50% corner radii on a non-square box retain an ellipse rather than a capsule", () => {
  const notes: string[] = [];
  const style = styleOf(node("50%"), notes);
  expect(shapeExpr(style, 272, 176)).toBe("Ellipse()");
  expect(notes).toEqual([]);
});
test("a circular pill radius still emits a capsule", () => {
  const notes: string[] = [];
  const style = styleOf(node("88px"), notes);
  expect(shapeExpr(style, 272, 176)).toBe("Capsule(style: .circular)");
  expect(notes).toEqual([]);
});

test("a measured box keeps paint, borders and effects together", () => {
  const styles: Record<string, string> = {
    "background-color": "rgb(255, 0, 0)",
    opacity: "0.5", "overflow-x": "hidden", filter: "blur(3px)",
    transform: "matrix(1, 0, 0, 1, 5, 6)", "transform-origin": "50px 40px",
    "outline-style": "solid", "outline-width": "1px", "outline-color": "rgb(0, 255, 0)", "outline-offset": "2px",
  };
  for (const edge of ["top", "right", "bottom", "left"]) {
    styles[`border-${edge}-style`] = "solid";
    styles[`border-${edge}-width`] = "2px";
    styles[`border-${edge}-color`] = "rgb(0, 0, 255)";
  }
  const notes: string[] = [];
  const style = styleOf({ tag: "main", attrs: {}, bounds: { x: 0, y: 0, w: 100, h: 80 }, children: [], styles }, notes);
  expect(style.fills).toEqual([{ kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }]);
  expect(style.border).toEqual({ width: 2, color: { r: 0, g: 0, b: 1, a: 1 } });
  expect(style.opacity).toBe(0.5);
  expect(style.clip).toBe(true);
  expect(style.blur).toBe(3);
  expect(style.transform).toEqual({ rotate: 0, scaleX: 1, scaleY: 1, tx: 5, ty: 6, origin: [50, 40] });
  expect(style.outline).toEqual({ width: 1, color: { r: 0, g: 1, b: 0, a: 1 }, style: "solid", offset: 2 });
  expect(notes).toEqual([]);
});
