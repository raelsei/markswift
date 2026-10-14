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

  test("042: caption-bottom — a caption first in the markup but painted below stays below the rows", () => {
    const table = el("table", { x: 0, y: 0, w: 200, h: 66 }, { display: "table", "border-collapse": "collapse" }, [
      el("caption", { x: 0, y: 40, w: 200, h: 26 }, { display: "table-caption", "caption-side": "bottom" }, [
        textNode("Quarterly sales", { x: 0, y: 43, w: 100, h: 20 }),
      ]),
      el("tbody", { x: 0, y: 0, w: 200, h: 40 }, { display: "table-row-group" }, [
        el("tr", { x: 0, y: 0, w: 200, h: 40 }, { display: "table-row" }, [
          el("td", { x: 0, y: 0, w: 200, h: 40 }, { display: "table-cell" }, [
            textNode("Q1", { x: 0, y: 10, w: 20, h: 20 }),
          ]),
        ]),
      ]),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 66 }, { display: "block" }, [table])), "s");
    const texts = flatten(screen.root).filter((n): n is TextNode => n.kind === "text");
    expect(texts.map((t) => t.runs[0]!.text)).toEqual(["Q1", "Quarterly sales"]);
  });

  test("042: row-border-inset — a collapsed row border lies inside its cells, not inside the row", () => {
    const line = {
      "border-bottom-style": "solid",
      "border-bottom-width": "1px",
      "border-bottom-color": "rgb(0, 0, 0)",
    };
    const row = (y: number, text: string) =>
      el("tr", { x: 0, y, w: 200, h: 38 }, { display: "table-row", ...line }, [
        el("td", { x: 0, y, w: 200, h: 38 }, { display: "table-cell", "padding-top": "8px" }, [
          textNode(text, { x: 0, y: y + 8, w: 20, h: 20 }),
        ]),
      ]);
    const table = el("table", { x: 0, y: 0, w: 200, h: 76 }, { display: "table", "border-collapse": "collapse" }, [
      el("tbody", { x: 0, y: 0, w: 200, h: 76 }, { display: "table-row-group", ...line }, [
        row(0, "Q1"),
        row(38, "Q2"),
      ]),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 76 }, { display: "block" }, [table])), "s");
    const ruled = flatten(screen.root).filter((n) => n.style.borderSides?.bottom);
    expect(ruled.map((n) => n.frame.h)).toEqual([76, 38, 38]);
    expect(ruled.map((n) => n.padding)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });
});

describe("paint invisible at rest", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const clear = { opacity: "0", "background-color": "rgb(0, 0, 255)" };
  const positioned = (child: LayoutNode) =>
    inferScreen(doc(el("main", box, { display: "block", position: "relative" }, [child])), "s").root;

  test("a transparent absolute overlay with nothing to read is dropped", () => {
    expect(positioned(el("div", box, { position: "absolute", ...clear })).overlays).toHaveLength(0);
  });

  test("a transparent overlay with text stays: assistive technology still reads it", () => {
    const root = positioned(el("div", box, { position: "absolute", ...clear }, [textNode("Hi", box)]));
    expect(root.overlays).toHaveLength(1);
    expect(root.overlays[0]!.node.style.opacity).toBe(0);
  });

  test("a transparent in-flow node keeps its space but draws nothing", () => {
    const a = el("div", { x: 0, y: 0, w: 100, h: 50 }, { display: "block", ...clear });
    const b = el("div", { x: 0, y: 50, w: 100, h: 50 }, { display: "block", "background-color": "rgb(255, 0, 0)" });
    const root = inferScreen(doc(el("main", box, { display: "block" }, [a, b])), "s").root;
    const hidden = flatten(root).find((n) => n.style.hidden);
    expect(hidden?.style.opacity).toBeUndefined();
    expect(hidden?.frame).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(root.kind === "stack" && root.children.includes(hidden!)).toBe(true);
  });

  test("an animated transparent overlay stays: the animation may reveal it", () => {
    const root = positioned(el("div", box, { position: "absolute", ...clear, "animation-name": "fade" }));
    expect(root.overlays).toHaveLength(1);
  });

  test("a transparent overlay a pressed state reveals stays", () => {
    const glow = { ...el("div", box, { position: "absolute", ...clear }), states: { pressed: { opacity: "1" } } };
    expect(positioned(glow).overlays).toHaveLength(1);
  });

  test("an aria-hidden transparent control is dropped: neither seen nor announced (Radix's form-value input)", () => {
    const input = (attrs: Record<string, string>) =>
      positioned(el("input", { x: 0, y: 0, w: 13, h: 13 }, { position: "absolute", opacity: "0" }, [], attrs));
    expect(input({ type: "checkbox", "aria-hidden": "true", checked: "" }).overlays).toHaveLength(0);
    // Without aria-hidden Chrome still announces it (a visually hidden native input behind a drawn box).
    expect(input({ type: "checkbox" }).overlays).toHaveLength(1);
  });
});

describe("ARIA names", () => {
  const tab = el(
    "button",
    { x: 0, y: 0, w: 40, h: 20 },
    { display: "inline-block" },
    [textNode("All", { x: 0, y: 0, w: 20, h: 20 })],
    {
      id: "t",
      role: "tab",
    },
  );
  const page = (panel: LayoutNode) =>
    inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 60 }, { display: "block" }, [tab, panel])), "s").root;

  test("a text-only tabpanel's name labels a group around its Text, never the Text's words", () => {
    const panel = el(
      "div",
      { x: 0, y: 30, w: 200, h: 20 },
      { display: "block" },
      [textNode("Body copy", { x: 0, y: 30, w: 80, h: 20 })],
      {
        role: "tabpanel",
        "aria-labelledby": "t",
      },
    );
    const text = flatten(page(panel)).find((n): n is TextNode => n.kind === "text" && n.runs[0]?.text === "Body copy");
    expect(text?.a11y).toEqual({ label: "All", container: true });
    // A heading's name stands for its words (Chrome's name from author on a name-from-content role).
    const heading = el(
      "h2",
      { x: 0, y: 30, w: 200, h: 20 },
      { display: "block" },
      [textNode("Body copy", { x: 0, y: 30, w: 80, h: 20 })],
      {
        "aria-label": "Summary",
      },
    );
    const h2 = flatten(page(heading)).find((n) => n.kind === "text" && n.a11y?.heading);
    expect(h2?.a11y?.container).toBeUndefined();
  });

  test("a tabpanel container keeps its name: it labels the group, not a child", () => {
    const panel = el(
      "div",
      { x: 0, y: 30, w: 200, h: 30 },
      { display: "block" },
      [
        el("p", { x: 0, y: 30, w: 200, h: 15 }, { display: "block" }, [textNode("One", { x: 0, y: 30, w: 30, h: 15 })]),
        el("p", { x: 0, y: 45, w: 200, h: 15 }, { display: "block" }, [textNode("Two", { x: 0, y: 45, w: 30, h: 15 })]),
      ],
      { role: "tabpanel", "aria-labelledby": "t" },
    );
    const named = flatten(page(panel)).filter((n) => n.a11y?.label === "All");
    expect(named.map((n) => n.kind)).toEqual(["stack"]);
  });
});
