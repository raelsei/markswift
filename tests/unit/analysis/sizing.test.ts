import { expect, test } from "bun:test";
import { sizeOf } from "../../../src/analysis/sizing.ts";
import { parseDeclared } from "../../../src/css/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { InferenceContext } from "../../../src/analysis/context.ts";

function element(w: number, h: number, styles: Record<string, string> = {}, children: LayoutNode[] = [], inline = ""): LayoutNode {
  return { tag: "div", attrs: { style: inline }, bounds: { x: 0, y: 0, w, h }, styles, children };
}
const parent = element(400, 200, { display: "block", "padding-left": "20px", "padding-right": "20px", "border-left-style": "solid", "border-right-style": "solid", "border-left-width": "5px", "border-right-width": "5px" });
const ctx: InferenceContext = { root: parent, parent, parentAxis: "v", parentDisplay: "block", parentAlign: "stretch", bundledFamilies: {}, fixed: [] };
function sizing(n: LayoutNode, context = ctx) {
  const notes: string[] = [];
  return { ...sizeOf(n, parseDeclared(n.attrs.style), context, notes), notes };
}
const ownInsets = { "padding-left": "10px", "padding-right": "10px", "border-left-style": "solid", "border-right-style": "solid", "border-left-width": "4px", "border-right-width": "4px" };

test.each([
  ["50%", "border-box", 175],
  ["50%", "content-box", 203],
  ["calc(50% - 10px)", "border-box", 165],
  ["calc(50% - 10px)", "content-box", 193],
  ["120px", "border-box", 120],
  ["120px", "content-box", 148],
] as const)("max-width %s with %s is normalized to border-box pixels", (value, boxSizing, expected) => {
  expect(sizing(element(expected, 40, { ...ownInsets, "box-sizing": boxSizing, "max-width": value })).maxWidth).toBe(expected);
});

test("intrinsic or unresolved max-width never turns into a zero-pixel cap", () => {
  const result = sizing(element(120, 40, { "max-width": "fit-content" }));
  expect(result.maxWidth).toBe(120);
  expect(result.notes.join("\n")).toContain("max-width");
});

test("a percentage cap without a captured containing block preserves the observed width", () => {
  const n = element(175, 40, { "max-width": "50%" });
  const result = sizing(n, { root: n, bundledFamilies: {}, fixed: [] });
  expect(result.maxWidth).toBe(175);
  expect(result.notes.join("\n")).toContain("captured");
});

test("min-width wins over a conflicting max-width", () => {
  const result = sizing(element(180, 40, { "min-width": "180px", "max-width": "100px", "box-sizing": "border-box" }));
  expect(result).toMatchObject({ minWidth: 180, maxWidth: 180 });
});

test("a small border-box limit cannot make the content box negative", () => {
  expect(sizing(element(28, 40, { ...ownInsets, "max-width": "5px", "box-sizing": "border-box" })).maxWidth).toBe(28);
});

test("height floors and caps survive text line-box slack", () => {
  const text = { ...element(40, 16), tag: "#text", text: "Hi" };
  const common = { "line-height": "20px", "box-sizing": "border-box" };
  expect(sizing(element(40, 30, { ...common, "min-height": "30px" }, [text])).minHeight).toBe(30);
  expect(sizing(element(40, 10, { ...common, "max-height": "10px" }, [text])).maxHeight).toBe(10);
});

test("vertical content-box constraints include vertical padding and borders", () => {
  const n = element(80, 70, { "min-height": "40px", "max-height": "60px", "padding-top": "10px", "padding-bottom": "10px", "border-top-style": "solid", "border-bottom-style": "solid", "border-top-width": "5px", "border-bottom-width": "5px" });
  expect(sizing(n)).toMatchObject({ minHeight: 70, maxHeight: 90 });
});

test("percentage heights keep the captured constraint instead of guessing parent definiteness", () => {
  const result = sizing(element(40, 60, { "min-height": "50%", "max-height": "calc(75% - 10px)" }));
  expect(result).toMatchObject({ minHeight: 60, maxHeight: 60 });
  expect(result.notes.join("\n")).toContain("captured");
});

test("100% content-box dimensions with padding retain measured overflow", () => {
  const containing = element(200, 100);
  const context = { ...ctx, root: containing, parent: containing };
  const n = element(224, 124, { "padding-left": "10px", "padding-right": "10px", "padding-top": "10px", "padding-bottom": "10px", "border-left-style": "solid", "border-right-style": "solid", "border-top-style": "solid", "border-bottom-style": "solid", "border-left-width": "2px", "border-right-width": "2px", "border-top-width": "2px", "border-bottom-width": "2px", "box-sizing": "content-box" }, [], "width:100%;height:100%");
  expect(sizing(n, context)).toMatchObject({ width: { kind: "fixed", px: 224 }, height: { kind: "fixed", px: 124 } });
});

test("100% border-box dimensions still fill the captured containing box", () => {
  const containing = element(200, 100);
  const n = element(200, 100, { "box-sizing": "border-box" }, [], "width:100%;height:100%");
  expect(sizing(n, { ...ctx, root: containing, parent: containing })).toMatchObject({ width: { kind: "fill" }, height: { kind: "fill" } });
});

test("stylesheet fixed sizes are retained even when they happen to match content extent", () => {
  const n = { ...element(120, 40, {}, [element(120, 40)]), preferredSize: { width: "120px", height: "40px" } };
  expect(sizing(n)).toMatchObject({ width: { kind: "fixed", px: 120 }, height: { kind: "fixed", px: 40 } });
});

test("captured CSS size intent wins over an inline value overridden by the cascade", () => {
  const containing = element(200, 100);
  const n = { ...element(200, 30, {}, [element(200, 30)], "width:120px;height:100px"), preferredSize: { width: "auto", height: "auto" } };
  expect(sizing(n, { ...ctx, parent: containing })).toMatchObject({ width: { kind: "fill" }, height: { kind: "hug" } });
});

test("ordinary inline text does not acquire CSS constraints that the browser ignores", () => {
  expect(sizing(element(30, 20, { display: "inline", "min-width": "120px", "min-height": "80px", "max-width": "200px" }))).toMatchObject({ width: { kind: "fixed", px: 30 } });
  expect(sizing(element(30, 20, { display: "inline", "min-width": "120px" })).minWidth).toBeUndefined();
});
