import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Rect } from "../../../src/model/layout.ts";
import { axParity } from "../../../tools/verify/ax.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(tag: string, bounds: Rect, children: LayoutNode[] = [], attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, display: "block" }, bounds, children };
}

const text = (s: string, bounds: Rect): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: { ...INHERITED },
  bounds,
  text: s,
  children: [],
});

function screen(...children: LayoutNode[]) {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "test",
    combo: { screen: "s", theme: "light" },
    size: { w: 300, h: 200 },
    dpr: 3,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: el("div", { x: 0, y: 0, w: 300, h: 200 }, children),
  };
  return inferScreen(doc, "s");
}

test("a button with text matches its Chrome button", () => {
  const s = screen(el("button", { x: 0, y: 0, w: 80, h: 30 }, [text("Save", { x: 10, y: 5, w: 40, h: 20 })]));
  expect(axParity([{ role: "button", name: "save" }], s)).toEqual([]);
});

test("a heading matches its Chrome heading", () => {
  const s = screen(el("h2", { x: 0, y: 0, w: 300, h: 30 }, [text("Billing", { x: 0, y: 5, w: 60, h: 20 })]));
  expect(axParity([{ role: "heading", name: "billing" }], s)).toEqual([]);
});

test("StaticText split across two IR text nodes matches the joined screen text", () => {
  const s = screen(
    el("p", { x: 0, y: 0, w: 300, h: 20 }, [text("Hello", { x: 0, y: 0, w: 40, h: 20 })]),
    el("p", { x: 0, y: 40, w: 300, h: 20 }, [text("world", { x: 0, y: 40, w: 40, h: 20 })]),
  );
  expect(axParity([{ role: "StaticText", name: "hello world" }], s)).toEqual([]);
});

test("an img alt matches its Chrome image", () => {
  const s = screen(el("img", { x: 0, y: 0, w: 40, h: 40 }, [], { alt: "Avatar", src: "a.png" }));
  expect(axParity([{ role: "image", name: "avatar" }], s)).toEqual([]);
});

test("a Chrome link with no IR link is reported missing", () => {
  const s = screen(el("p", { x: 0, y: 0, w: 300, h: 20 }, [text("Docs", { x: 0, y: 0, w: 40, h: 20 })]));
  expect(axParity([{ role: "link", name: "docs" }], s)).toEqual([{ role: "link", name: "docs" }]);
});

test("a button's name includes descendant labels in any order", () => {
  const s = screen(
    el("button", { x: 0, y: 0, w: 100, h: 30 }, [
      text("Saving", { x: 30, y: 5, w: 50, h: 20 }),
      el("img", { x: 5, y: 7, w: 16, h: 16 }, [], { alt: "Loading", src: "s.png" }),
    ]),
  );
  expect(axParity([{ role: "button", name: "loading saving" }], s)).toEqual([]);
});
