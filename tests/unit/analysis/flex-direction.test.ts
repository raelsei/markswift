/**
 * Flex alignment and direction in visual terms (plan 011): reverse/RTL packing, text alignment,
 * unbreakable words, align-self and auto margins. Hand-built layout docs, as in infer.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { crossAlign, distributionOf } from "../../../src/analysis/alignment.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { SemNode, TextNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = [], attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, ...styles }, bounds, children, ...(attrs["id"] ? { id: attrs["id"] } : {}) };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode): LayoutDoc {
  return { version: 2, source: "test", combo: { screen: "s", theme: "light" }, size: { w: root.bounds.w, h: root.bounds.h }, dpr: 3, canvas: "rgb(255, 255, 255)", fonts: [], root };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

const BOX = { x: 0, y: 0, w: 300, h: 40 };

describe("Step 1 direction", () => {
  const packing: [string, string, string, string][] = [
    // flex-direction, direction, justify-content, visual side (Chrome, 2026-10-10)
    ["row-reverse", "ltr", "flex-end", "start"],
    ["row-reverse", "ltr", "flex-start", "end"],
    ["row-reverse", "ltr", "normal", "end"],
    ["row-reverse", "ltr", "start", "start"],
    ["row", "rtl", "flex-end", "start"],
    ["row", "rtl", "normal", "end"],
    ["row", "rtl", "start", "end"],
    ["row", "rtl", "end", "start"],
    ["row", "rtl", "left", "start"],
    ["row", "rtl", "right", "end"],
    ["row-reverse", "rtl", "flex-end", "end"],
    ["column-reverse", "ltr", "flex-end", "start"],
    ["column-reverse", "ltr", "normal", "end"],
    ["column-reverse", "ltr", "start", "start"],
    ["column", "ltr", "right", "start"],
    ["row", "ltr", "center", "center"],
    ["row-reverse", "ltr", "space-between", "between"],
  ];
  for (const [fd, dir, jc, side] of packing) {
    test(`justify-content ${jc} in ${fd}/${dir} packs at ${side}`, () => {
      expect(distributionOf(el("div", BOX, { display: "flex", "flex-direction": fd, direction: dir, "justify-content": jc }))).toBe(side as never);
    });
  }

  const cross: [string, string, string, string][] = [
    ["column", "rtl", "flex-start", "end"],
    ["column", "rtl", "start", "end"],
    ["column", "rtl", "flex-end", "start"],
    ["column", "rtl", "end", "start"],
    ["column", "rtl", "center", "center"],
    ["row", "rtl", "flex-start", "start"],
  ];
  for (const [fd, dir, ai, side] of cross) {
    test(`align-items ${ai} in ${fd}/${dir} sits at ${side}`, () => {
      expect(crossAlign(el("div", BOX, { display: "flex", "flex-direction": fd, direction: dir, "align-items": ai }))).toBe(side as never);
    });
  }

  test("a row-reverse row packed at flex-end sits at the visual start", () => {
    const r = el("div", BOX, { display: "flex", "flex-direction": "row-reverse", "justify-content": "flex-end" }, [
      el("div", { x: 50, y: 0, w: 50, h: 40 }, { display: "block" }, [], { id: "a" }),
      el("div", { x: 0, y: 0, w: 50, h: 40 }, { display: "block" }, [], { id: "b" }),
    ], { id: "r" });
    const screen = inferScreen(doc(el("main", BOX, { display: "block" }, [r])), "t");
    const stack = flatten(screen.root).find((n) => n.id === "r");
    if (stack?.kind !== "stack") throw new Error("expected #r stack");
    expect(stack.distribution).toBe("start");
    expect(stack.leadInset ?? 0).toBe(0);
  });
});

/** The TextNode a leaf host becomes, inside a block `main` as wide as it. */
function leafText(host: LayoutNode): TextNode {
  const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: host.bounds.w, h: host.bounds.h }, { display: "block" }, [host])), "t");
  const t = flatten(screen.root).find((n) => n.kind === "text");
  if (t?.kind !== "text") throw new Error("expected a text node");
  return t;
}

describe("Step 2 text alignment", () => {
  test("-webkit-center (<center>, align=center) centres the text", () => {
    const t = leafText(el("div", { x: 0, y: 0, w: 200, h: 20 }, { display: "block", "text-align": "-webkit-center" }, [textNode("Hi", { x: 90, y: 3, w: 20, h: 14 })]));
    expect(t.align).toBe("center");
  });

  test("-webkit-right aligns trailing", () => {
    const t = leafText(el("div", { x: 0, y: 0, w: 200, h: 20 }, { display: "block", "text-align": "-webkit-right" }, [textNode("Hi", { x: 180, y: 3, w: 20, h: 14 })]));
    expect(t.align).toBe("trailing");
  });

  test("a flex column's justify-content centres vertically, not horizontally", () => {
    const t = leafText(el("div", { x: 0, y: 0, w: 200, h: 100 }, { display: "flex", "flex-direction": "column", "justify-content": "center" }, [textNode("Hi", { x: 0, y: 43, w: 20, h: 14 })]));
    expect(t.align).toBe("leading");
    expect(t.padding).toEqual([0, 0, 0, 0]);
  });

  test("a flex column's align-items centres horizontally; the text stays at the top", () => {
    const t = leafText(el("div", { x: 0, y: 0, w: 200, h: 100 }, { display: "flex", "flex-direction": "column", "align-items": "center" }, [textNode("Hi", { x: 90, y: 0, w: 20, h: 14 })]));
    expect(t.align).toBe("center");
    expect(t.padding).toEqual([0, 0, 80, 0]);
  });

  test("a td with vertical-align: middle keeps its text vertically centred", () => {
    const t = leafText(el("td", { x: 0, y: 0, w: 200, h: 60 }, { display: "table-cell", "vertical-align": "middle" }, [textNode("Hi", { x: 0, y: 23, w: 20, h: 14 })]));
    expect(t.padding).toEqual([0, 0, 0, 0]);
  });

  test("block text in a taller box stays at the top", () => {
    const t = leafText(el("p", { x: 0, y: 0, w: 200, h: 30 }, { display: "block", "min-height": "30px" }, [textNode("Hi", { x: 0, y: 3, w: 20, h: 14 })]));
    expect(t.padding).toEqual([0, 0, 10, 0]);
  });

  test("a flex row aligned to flex-end puts the surplus above the text", () => {
    const t = leafText(el("div", { x: 0, y: 0, w: 200, h: 60 }, { display: "flex", "align-items": "flex-end" }, [textNode("Hi", { x: 0, y: 43, w: 20, h: 14 })]));
    expect(t.padding).toEqual([40, 0, 0, 0]);
  });
});
