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
