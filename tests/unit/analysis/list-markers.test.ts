import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";

const styles = { color: "rgb(0,0,0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px", display: "block" };
const node = (tag: string, bounds: Rect, children: LayoutNode[] = [], overrides: Record<string, string> = {}): LayoutNode =>
  ({ id: tag, tag, attrs: {}, bounds, children, styles: { ...styles, ...overrides } });
const text = (value: string, bounds: Rect): LayoutNode => ({ tag: "#text", text: value, attrs: {}, bounds, children: [], styles: {} });
const doc = (root: LayoutNode): LayoutDoc => ({ version: 1, root, source: "marker-regression", dpr: 2,
  canvas: "white", size: { w: 200, h: 60 }, combo: { screen: "list", theme: "light", demoState: "normal" } });
function inferItem(item: LayoutNode) {
  const root = inferScreen(doc(node("main", { x: 0, y: 0, w: 200, h: 60 }, [item])), "List").root;
  if (root.kind !== "stack" || !root.children[0]) throw new Error("Missing measured list item");
  return root.children[0];
}

for (const display of ["inline-block", "inline"]) test(`outside ${display} marker preserves a text leaf's full CSS line box`, () => {
  const marker = node("::marker", { x: 3, y: 0, w: 7, h: 20 }, [text("• ", { x: 3, y: 1, w: 7, h: 17 })], { display });
  const item = node("li", { x: 20, y: 0, w: 180, h: 20 }, [marker, text("Alpha", { x: 20, y: 1, w: 40, h: 17 })]);
  const result = inferItem(item);
  expect(result.kind).toBe("text");
  if (result.kind !== "text") return;
  expect(result.frame.h).toBe(20); expect(result.height.kind).toBe("hug");
  expect(result.runs.map(run => run.text)).toEqual(["Alpha"]);
  expect(result.overlays.map(overlay => overlay.offset)).toEqual([[-17, 0]]);
});

test("an outside marker does not form a synthetic inline row before a nested list", () => {
  const marker = node("::marker", { x: 3, y: 0, w: 7, h: 20 }, [text("• ", { x: 3, y: 1, w: 7, h: 17 })], { display: "inline-block" });
  const nested = node("ul", { x: 20, y: 20, w: 180, h: 40 });
  const item = node("li", { x: 20, y: 0, w: 180, h: 60 }, [marker, text("Alpha", { x: 20, y: 1, w: 40, h: 17 }), nested]);
  const result = inferItem(item);
  expect(result.kind).toBe("stack");
  if (result.kind !== "stack") return;
  expect(result.axis).toBe("v"); expect(result.children.map(child => child.kind)).toEqual(["text", "box"]);
  expect(result.spacing).toBe(2); expect(result.leadInset).toBe(1);
  expect(result.overlays).toHaveLength(1);
});

test("inside markers keep their inline space", () => {
  const marker = node("::marker", { x: 20, y: 0, w: 7, h: 20 }, [text("• ", { x: 20, y: 1, w: 7, h: 17 })], { display: "inline" });
  const item = node("li", { x: 20, y: 0, w: 180, h: 20 }, [marker, text("Alpha", { x: 41, y: 1, w: 40, h: 17 })]);
  const result = inferItem(item);
  expect(result.kind).toBe("text");
  if (result.kind === "text") expect(result.runs.map(run => run.text).join("")).toBe("• Alpha");
  expect(result.overlays).toHaveLength(0);
});
