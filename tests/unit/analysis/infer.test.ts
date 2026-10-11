import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
/**
 * Semantic inference over hand-built layout docs. One measured tree per case, so a regression
 * shows up in `bun test` seconds instead of a corpus run.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { ControlNode, SemNode, TextNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(
  tag: string,
  bounds: Rect,
  styles: Record<string, string>,
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, ...styles }, bounds, children };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "test",
    combo: { screen: "s", theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    dpr: 3,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

describe("text groups", () => {
  // Two inline controls on separate source lines: the whitespace between them is a text node the
  // browser collapsed away entirely. It used to become a `TextNode` with zero runs, which the
  // emitter wrote as an empty run array — invalid Swift in both modes.
  test("a run group that is nothing but collapsed whitespace does not become a text node", () => {
    const section = el("section", { x: 0, y: 0, w: 200, h: 21 }, { display: "block" }, [
      textNode("\n  ", { x: 0, y: 0, w: 0, h: 0 }),
      el("input", { x: 0, y: 0, w: 70, h: 21 }, {}, [], { type: "text", value: "a" }),
      textNode("\n  ", { x: 70, y: 0, w: 4, h: 21 }),
      el("input", { x: 74, y: 0, w: 70, h: 21 }, {}, [], { type: "text", value: "b" }),
      textNode("\n", { x: 0, y: 0, w: 0, h: 0 }),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 21 }, { display: "block" }, [section])), "s");
    const texts = flatten(screen.root).filter((n): n is TextNode => n.kind === "text");
    expect(texts.map((t) => t.runs.length)).not.toContain(0);
  });

  test("a whitespace-only element is its own box, not an empty text node", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("div", { x: 0, y: 0, w: 200, h: 20 }, { "background-color": "rgb(255, 0, 0)" }, [
        textNode("   ", { x: 0, y: 0, w: 0, h: 0 }),
      ]),
    ]);
    const div = flatten(inferScreen(doc(root), "s").root).find((n) => n.frame.h === 20 && n.kind !== "stack");
    expect(div?.kind).toBe("box");
  });

  test("real text still becomes a text node with its runs", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 20 }, {}, [textNode("hello", { x: 0, y: 3, w: 40, h: 14 })]),
    ]);
    const texts = flatten(inferScreen(doc(root), "s").root).filter((n): n is TextNode => n.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0]?.runs.map((r) => r.text)).toEqual(["hello"]);
  });
});

describe("line height", () => {
  // Tailwind's type scale always sets both, so this is the common case, not the exception.
  test("an explicit line-height rides on the run's font and is no longer an approximation", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 20 }, { "line-height": "20px" }, [
        textNode("hello", { x: 0, y: 3, w: 40, h: 14 }),
      ]),
    ]);
    const text = flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text");
    expect(text?.runs[0]?.font.lineHeight).toBe(20);
    expect(text?.diagnostics).toEqual([]);
    expect(text?.confidence).toBe("mapped");
  });

  test("line-height: normal leaves the font without one", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 17 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 17 }, { "line-height": "normal" }, [
        textNode("hello", { x: 0, y: 1, w: 40, h: 14 }),
      ]),
    ]);
    const text = flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text");
    expect(text?.runs[0]?.font.lineHeight).toBeUndefined();
  });
});

test("a colour picker's swatch is resolved during analysis; a missing or invalid value is black", () => {
  const swatch = (value: string) => {
    const root = el("main", { x: 0, y: 0, w: 100, h: 40 }, { display: "block" }, [
      el("input", { x: 0, y: 0, w: 50, h: 27 }, {}, [], { type: "color", value }),
    ]);
    const control = flatten(inferScreen(doc(root), "s").root).find((n): n is ControlNode => n.kind === "control");
    expect(control?.control).toBe("colorPicker");
    return control!.swatch!;
  };
  const orange = swatch("#ff8800");
  expect(orange.r).toBeCloseTo(1, 4);
  expect(orange.g).toBeCloseTo(0.5333, 4);
  expect(orange.b).toBeCloseTo(0, 4);
  expect(orange.a).toBeCloseTo(1, 4);
  expect(swatch("nope")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
});

describe("tables", () => {
  test("the table's paint covers its rows, not its caption", () => {
    const paint = { "background-color": "rgb(255, 255, 255)", "border-top-left-radius": "10px" };
    const table = el("table", { x: 0, y: 0, w: 200, h: 66 }, { display: "table", ...paint }, [
      el("caption", { x: 0, y: 0, w: 200, h: 26 }, { display: "table-caption" }, [
        textNode("Quarterly sales", { x: 0, y: 0, w: 100, h: 20 }),
      ]),
      el("tbody", { x: 0, y: 26, w: 200, h: 40 }, { display: "table-row-group" }, [
        el("tr", { x: 0, y: 26, w: 200, h: 40 }, { display: "table-row" }, [
          el("td", { x: 0, y: 26, w: 200, h: 40 }, { display: "table-cell" }, [
            textNode("Q1", { x: 0, y: 36, w: 20, h: 20 }),
          ]),
        ]),
      ]),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 66 }, { display: "block" }, [table])), "s");
    const filled = flatten(screen.root).filter((n) => n.style.fills.length > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0]!.frame).toEqual({ x: 0, y: 26, w: 200, h: 40 });
    expect(filled[0]!.style.radius).toEqual([10, 0, 0, 0]);
  });
});
