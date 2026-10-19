import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
/**
 * Semantic inference over hand-built layout docs. One measured tree per case, so a regression
 * shows up in `bun test` seconds instead of a corpus run.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { ControlNode, GridNode, SemNode, StackNode, TextNode } from "../../../src/model/semantic.ts";
import { collapsed, doc as tableDoc, separated } from "../../helpers/tables.ts";

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
    viewport: { x: 0, y: 0, w: root.bounds.w, h: root.bounds.h },
    conditions: [],
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
  // browser collapsed away entirely. As a `TextNode` with zero runs, the emitter would write an
  // empty run array — invalid Swift in both modes.
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

  const inline = (tag: string, dir: string, bidi: string | undefined, text: string, x: number, attrs = {}) =>
    el(
      tag,
      { x, y: 0, w: 40, h: 20 },
      { display: "inline", direction: dir, ...(bidi ? { "unicode-bidi": bidi } : {}) },
      [textNode(text, { x, y: 3, w: 40, h: 14 })],
      attrs,
    );
  const runsOf = (children: LayoutNode[], host: Record<string, string> = {}) => {
    const p = el(
      "p",
      { x: 0, y: 0, w: 300, h: 20 },
      { display: "block", "unicode-bidi": "isolate", ...host },
      children,
    );
    const root = el("main", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [p]);
    const text = flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text")!;
    return text.runs.map((r) => r.text).join("|");
  };

  test("bdo overrides and bdi isolates their runs with Unicode bidi controls, in the computed direction", () => {
    expect(
      runsOf([
        textNode("a ", { x: 0, y: 3, w: 10, h: 14 }),
        inline("bdo", "rtl", "isolate-override", "rev", 10, { dir: "rtl" }),
        textNode(" b ", { x: 50, y: 3, w: 10, h: 14 }),
        inline("bdi", "ltr", "isolate", "iso", 60),
        textNode(" c ", { x: 100, y: 3, w: 10, h: 14 }),
        inline("span", "rtl", "isolate", "sp", 110, { dir: "rtl" }),
        textNode(" d", { x: 150, y: 3, w: 10, h: 14 }),
      ]),
    ).toBe("a |\u2067\u202Erev\u202C\u2069| b |\u2066iso\u2069| c |\u2067sp\u2069| d");
  });

  test("an author unicode-bidi on an inline span maps to its controls, without a tag or dir", () => {
    const one = (bidi: string | undefined, dir = "rtl", tag = "span", attrs = {}) =>
      runsOf([textNode("a ", { x: 0, y: 3, w: 10, h: 14 }), inline(tag, dir, bidi, "sp", 10, attrs)]);
    expect(one("bidi-override")).toBe("a |\u202Esp\u202C");
    expect(one("embed")).toBe("a |\u202Bsp\u202C");
    expect(one("plaintext")).toBe("a |\u2068sp\u2069");
    expect(one("plaintext", "ltr")).toBe("a |\u2068sp\u2069");
    // The tag rule is gone: a `<bdo>` reset to `normal` gets nothing.
    expect(one("normal", "rtl", "bdo", { dir: "rtl" })).toBe("a |sp");
    // A hand-built node without the key reads as the initial `normal`.
    expect(one(undefined, "rtl", "span", { dir: "rtl" })).toBe("a |sp");
  });

  test("a text host keeps only the override of its own unicode-bidi", () => {
    const hello = textNode("hello", { x: 0, y: 3, w: 40, h: 14 });
    expect(runsOf([hello])).toBe("hello");
    expect(runsOf([{ ...hello }], { direction: "rtl", "unicode-bidi": "isolate-override" })).toBe("\u202Ehello\u202C");
  });

  test("an inside ::marker stays outside bidi controls despite its UA isolate", () => {
    const marker = el("::marker", { x: 0, y: 0, w: 20, h: 20 }, { display: "inline", "unicode-bidi": "isolate" }, [
      textNode("1. ", { x: 0, y: 3, w: 20, h: 14 }),
    ]);
    const li = el("li", { x: 0, y: 0, w: 300, h: 20 }, { display: "list-item", "unicode-bidi": "isolate" }, [
      marker,
      textNode("item", { x: 20, y: 3, w: 40, h: 14 }),
    ]);
    const root = el("main", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [li]);
    const texts = flatten(inferScreen(doc(root), "s").root).filter((n): n is TextNode => n.kind === "text");
    const joined = texts.flatMap((t) => t.runs.map((r) => r.text)).join("");
    expect(joined).toContain("1.");
    expect(joined).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
  });
});

describe("line height", () => {
  // Tailwind's type scale always sets both, so this is the common case, not the exception.
  test("an explicit line-height rides on the run's font and is not an approximation", () => {
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

  test("caption-bottom — a caption first in the markup but painted below stays below the rows", () => {
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

  const rule = (side: string) => ({
    [`border-${side}-style`]: "solid",
    [`border-${side}-width`]: "1px",
    [`border-${side}-color`]: "rgb(0, 0, 0)",
  });
  const pad = { "padding-top": "8px", "padding-right": "8px", "padding-bottom": "8px", "padding-left": "8px" };
  const row = (y: number, h: number, text: string, styles: Record<string, string> = {}) =>
    el("tr", { x: 0, y, w: 200, h }, { display: "table-row", ...styles }, [
      el("td", { x: 0, y, w: 200, h }, { display: "table-cell", ...pad }, [
        textNode(text, { x: 8, y: y + h / 2 - 10, w: 20, h: 20 }),
      ]),
    ]);
  /** Every painted rule as `<frame y>:<side>=<width>`, in tree order. */
  const rules = (root: SemNode) =>
    flatten(root).flatMap((n) =>
      Object.entries(n.style.borderSides ?? {}).map(([side, edge]) => `${n.frame.y}:${side}=${edge!.width}`),
    );

  const collapsedRule = (styles: Record<string, string>) =>
    // Chrome's boxes: each row holds half of every collapsed line it touches.
    el("table", { x: 0, y: 0, w: 200, h: 110.5 }, { display: "table", ...styles }, [
      el("tbody", { x: 0, y: 0, w: 200, h: 73.5 }, { display: "table-row-group" }, [
        row(0, 36.5, "Q1", rule("bottom")),
        row(36.5, 37, "Q2", rule("bottom")),
      ]),
      el("tfoot", { x: 0, y: 73.5, w: 200, h: 37 }, { display: "table-footer-group", ...rule("top") }, [
        row(73.5, 37, "Sum"),
      ]),
    ]);

  test("collapsed-rule — a row border is centred on the grid line: half in each row, the footer's top rule drawn once", () => {
    const table = collapsedRule({ "border-collapse": "collapse" });
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 110.5 }, { display: "block" }, [table])), "s");
    expect(rules(screen.root)).toEqual(["0:bottom=0.5", "36.5:top=0.5", "36.5:bottom=0.5", "73.5:top=0.5"]);
    const texts = flatten(screen.root).filter((n): n is TextNode => n.kind === "text");
    expect(texts.map((t) => [t.padding[0], t.padding[2]])).toEqual([
      [8, 8.5],
      [8.5, 8.5],
      [8.5, 8],
    ]);
  });

  test("collapsed-outer — the table holds the outer half of its edge cells' borders, cells the inner half", () => {
    const box = { ...rule("top"), ...rule("right"), ...rule("bottom"), ...rule("left") };
    const cell = (x: number, w: number) =>
      el("td", { x, y: 0.5, w, h: 37 }, { display: "table-cell", ...pad, ...box }, [
        textNode("Q", { x: x + 8.5, y: 9, w: 10, h: 20 }),
      ]);
    const table = el("table", { x: 0, y: 0, w: 200, h: 38 }, { display: "table", "border-collapse": "collapse" }, [
      el("tr", { x: 0.5, y: 0.5, w: 199, h: 37 }, { display: "table-row" }, [cell(0.5, 99.5), cell(100, 99.5)]),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 38 }, { display: "block" }, [table])), "s");
    const framed = flatten(screen.root).filter((n) => n.style.border);
    expect(framed.map((n) => [n.frame, n.style.border!.width, n.padding])).toEqual([
      [{ x: 0, y: 0, w: 200, h: 38 }, 0.5, [0.5, 0.5, 0.5, 0.5]],
    ]);
    expect(rules(screen.root)).toEqual([
      "0.5:top=0.5",
      "0.5:bottom=0.5",
      "0.5:right=0.5",
      "0.5:left=0.5",
      "0.5:right=0.5",
      "0.5:left=0.5",
    ]);
  });

  test("a separated table with abutting boxes (`border-spacing: 0`) keeps its own borders", () => {
    const screen = inferScreen(
      doc(
        el("main", { x: 0, y: 0, w: 200, h: 110.5 }, { display: "block" }, [
          collapsedRule({ "border-spacing": "0px" }),
        ]),
      ),
      "s",
    );
    expect(rules(screen.root)).toEqual(["0:bottom=1", "36.5:bottom=1", "73.5:top=1"]);
  });

  test("separated — cells apart by `border-spacing` keep their own borders", () => {
    const cell = (x: number) =>
      el("td", { x, y: 2, w: 97, h: 36 }, { display: "table-cell", ...pad, ...rule("bottom") }, [
        textNode("Q", { x: x + 8, y: 10, w: 10, h: 20 }),
      ]);
    const table = el("table", { x: 0, y: 0, w: 200, h: 40 }, { display: "table" }, [
      el("tr", { x: 2, y: 2, w: 196, h: 36 }, { display: "table-row" }, [cell(2), cell(101)]),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 40 }, { display: "block" }, [table])), "s");
    expect(rules(screen.root)).toEqual(["2:bottom=1", "2:bottom=1"]);
  });

  test("cell-middle — a table outside the MarkswiftTable subset keeps row alignment", () => {
    const cell = (x: number, kids: LayoutNode[]) =>
      el("td", { x, y: 0, w: 100, h: 38 }, { display: "table-cell", "vertical-align": "middle", padding: "8px" }, kids);
    const tr = el("tr", { x: 0, y: 0, w: 200, h: 38 }, { display: "table-row", "vertical-align": "middle" }, [
      cell(0, [textNode("Q1", { x: 8, y: 10, w: 20, h: 18 })]),
      cell(100, [el("span", { x: 108, y: 8, w: 40, h: 22 }, { display: "inline-flex", height: "22px" })]),
    ]);
    const table = el(
      "table",
      { x: 0, y: 0, w: 200, h: 38 },
      { display: "table", "border-collapse": "collapse", direction: "rtl" },
      [el("tbody", { x: 0, y: 0, w: 200, h: 38 }, { display: "table-row-group" }, [tr])],
    );
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 38 }, { display: "block" }, [table])), "s");
    const rows = flatten(screen.root).filter((n): n is StackNode => n.kind === "stack" && n.axis === "h");
    expect(rows.map((r) => r.align)).toEqual(["center"]);
  });

  const tableNotes = (n: SemNode) => n.diagnostics.filter((d) => d.feature === "table" || d.feature === "table-layout");
  const grids = (root: SemNode) => flatten(root).filter((n): n is GridNode => n.kind === "grid" && !!n.table);

  test("a captioned admitted table — caption, then the grid of its rows box with the table's paint and padding", () => {
    const t = separated();
    const root = inferScreen(tableDoc(t), "s").root as StackNode;
    const outer = root.children[0] as StackNode;
    expect(outer.kind).toBe("stack");
    expect(outer.children.map((c) => c.kind)).toEqual(["text", "grid"]);
    const grid = outer.children[1] as GridNode;
    expect(grid.frame).toEqual({ x: 0, y: 20, w: 300, h: 79 });
    expect(grid.padding).toEqual([6, 6, 6, 6]);
    // The trap: the layout keys stay on the table; nothing reports them.
    expect(JSON.stringify(outer.style)).not.toMatch(/spacing|collapse/);
    expect(outer.diagnostics.filter((d) => /border-(spacing|collapse)/.test(d.feature))).toEqual([]);
    expect(tableNotes(outer)).toEqual([]);
    expect(tableNotes(grid)).toEqual([
      {
        level: "approximated",
        feature: "table",
        message:
          "iOS exposes native two-dimensional table navigation; other platforms retain cell positions and supported headers as accessibility content",
      },
    ]);
  });

  test("an auto-width admitted table also reports the auto table layout", () => {
    const [grid] = grids(inferScreen(tableDoc(collapsed()), "s").root);
    expect(tableNotes(grid!).map((d) => [d.level, d.feature, d.message])).toEqual([
      [
        "approximated",
        "table",
        "iOS exposes native two-dimensional table navigation; other platforms retain cell positions and supported headers as accessibility content",
      ],
      [
        "approximated",
        "table-layout",
        "auto table layout → captured column widths scale with the offered width; CSS min-/max-content column sizing is not reproduced",
      ],
    ]);
  });

  test("a table outside the subset (rtl) keeps the measured rows and reports `approximated table`", () => {
    const t = collapsed();
    t.styles["direction"] = "rtl";
    const root = inferScreen(tableDoc(t), "s").root as StackNode;
    expect(grids(root)).toEqual([]);
    expect(root.children[0]!.diagnostics).toContainEqual(
      expect.objectContaining({ level: "approximated", feature: "table" }),
    );
  });

  test("a row with onclick keeps the measured-rows path and its action", () => {
    const t = collapsed();
    t.children[1]!.children[0]!.attrs["onclick"] = "go()";
    const root = inferScreen(tableDoc(t), "s").root as StackNode;
    expect(grids(root)).toEqual([]);
    const row = flatten(root).find((n): n is StackNode => n.kind === "stack" && n.axis === "h" && !!n.action);
    expect(row?.frame).toEqual({ x: 0, y: 30, w: 200, h: 30 });
    expect(root.children[0]!.diagnostics).toContainEqual(
      expect.objectContaining({ level: "approximated", feature: "table" }),
    );
  });

  test("empty-cells: hide paints no background or border on whitespace-only cells of a separated table", () => {
    const edge = (side: string) => ({
      [`border-${side}-style`]: "solid",
      [`border-${side}-width`]: "2px",
      [`border-${side}-color`]: "rgb(0, 0, 0)",
    });
    const paint = (emptyCells: string) => ({
      display: "table-cell",
      "empty-cells": emptyCells,
      "background-color": "rgb(255, 0, 0)",
      ...edge("top"),
      ...edge("right"),
      ...edge("bottom"),
      ...edge("left"),
    });
    const painted = (collapse: string, emptyCells: string) => {
      const cell = (x: number, kids: LayoutNode[]) => el("td", { x, y: 0, w: 46, h: 24 }, paint(emptyCells), kids);
      const row = el("tr", { x: 0, y: 0, w: 200, h: 24 }, { display: "table-row" }, [
        cell(0, []),
        cell(50, [textNode(" ", { x: 52, y: 2, w: 0, h: 0 })]),
        cell(100, [el("span", { x: 102, y: 2, w: 0, h: 20 }, { display: "inline" })]),
        cell(150, [textNode("x", { x: 152, y: 2, w: 8, h: 20 })]),
      ]);
      const table = el("table", { x: 0, y: 0, w: 200, h: 24 }, { display: "table", "border-collapse": collapse }, [
        row,
      ]);
      const nodes = flatten(
        inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 24 }, { display: "block" }, [table])), "s").root,
      );
      return {
        fills: [...new Set(nodes.filter((n) => n.style.fills.length).map((n) => n.frame.x))].sort((a, b) => a - b),
        borders: [...new Set(nodes.filter((n) => n.style.border || n.style.borderSides).map((n) => n.frame.x))].sort(
          (a, b) => a - b,
        ),
      };
    };
    expect(painted("separate", "hide")).toEqual({ fills: [100, 150], borders: [100, 150] });
    expect(painted("separate", "show")).toEqual({ fills: [0, 50, 100, 150], borders: [0, 50, 100, 150] });
    expect(painted("collapse", "hide").fills).toEqual([0, 50, 100, 150]);
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

describe("pointer-events", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const paint = { "background-color": "rgb(0, 0, 255)" };
  const none = { position: "absolute", "pointer-events": "none", ...paint };
  const positioned = (child: LayoutNode) =>
    inferScreen(doc(el("main", box, { display: "block", position: "relative" }, [child])), "s").root;

  test("an absolute pass-through veil is flagged", () => {
    expect(positioned(el("div", box, none)).overlays[0]?.node.hitTesting).toBe(false);
  });

  test("an in-flow pointer-events: none node is not: it covers no sibling", () => {
    const root = positioned(el("div", box, { display: "block", "pointer-events": "none", ...paint }));
    expect(flatten(root).some((n) => n.hitTesting === false)).toBe(false);
  });

  test("only the outermost pass-through overlay is flagged", () => {
    const root = positioned(el("div", box, none, [el("div", { x: 10, y: 10, w: 20, h: 20 }, none)]));
    expect(flatten(root).filter((n) => n.hitTesting === false)).toEqual([root.overlays[0]!.node]);
  });

  test("a pointer-events: auto descendant keeps the container hittable", () => {
    const live = el("div", { x: 10, y: 10, w: 20, h: 20 }, { display: "block", "pointer-events": "auto", ...paint });
    const root = positioned(el("div", box, none, [live]));
    expect(flatten(root).some((n) => n.hitTesting === false)).toBe(false);
  });

  test("a key-less childless child (a pseudo img) passes under a none parent", () => {
    const root = positioned(el("div", box, none, [el("img", { x: 10, y: 10, w: 20, h: 20 }, {})]));
    expect(root.overlays[0]?.node.hitTesting).toBe(false);
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

describe("inline box chain", () => {
  /** `<p>Find <span …><mark><b>this</b></mark></span></p>`: the run's own element is `b`. */
  function sentence(span: Record<string, string>): TextNode {
    const b = el("b", { x: 40, y: 0, w: 30, h: 20 }, { "font-weight": "700" }, [
      textNode("this", { x: 40, y: 3, w: 30, h: 14 }),
    ]);
    const mark = el("mark", { x: 40, y: 0, w: 30, h: 20 }, { "background-color": "rgb(255, 255, 0)" }, [b]);
    const p = el("p", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      textNode("Find ", { x: 0, y: 3, w: 40, h: 14 }),
      el("span", { x: 40, y: 0, w: 30, h: 20 }, span, [mark]),
    ]);
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [p]);
    return flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text")!;
  }

  test("an outer inline box paints behind a nested run (mark › b)", () => {
    const text = sentence({});
    const fills = text.overlays.map((o) => o.node.style.fills);
    expect(fills).toContainEqual([{ kind: "solid", color: { r: 1, g: 1, b: 0, a: 1 } }]);
  });

  test("inline opacity fades the run and composites into the box under it", () => {
    const text = sentence({ opacity: "0.5" });
    expect(text.runs.find((r) => r.text === "this")?.color.a).toBe(0.5);
    expect(text.runs.find((r) => r.text.startsWith("Find"))?.color.a).toBe(1);
    expect(text.overlays[0]?.node.style.opacity).toBe(0.5);
  });

  test("an inline filter or blend mode is reported, not dropped silently", () => {
    const text = sentence({ filter: "blur(2px)", "mix-blend-mode": "multiply" });
    const features = text.diagnostics.map((d) => d.feature);
    expect(features).toContain("filter");
    expect(features).toContain("mix-blend-mode");
  });
});

test("a video poster and an image button draw as an Image of their source, reported", () => {
  const POSTER = "data:image/png;base64,iVBORw0KGgo=";
  const box = { x: 0, y: 0, w: 160, h: 90 };
  const root = inferScreen(
    doc(
      el("main", { x: 0, y: 0, w: 160, h: 180 }, { display: "block" }, [
        el("video", box, { display: "block", "object-fit": "contain" }, [], { poster: POSTER, src: "clip.mp4" }),
        el("input", { ...box, y: 90 }, { display: "inline-block" }, [], { type: "IMAGE", src: POSTER, alt: "Go" }),
        el("video", { ...box, y: 180 }, { display: "block" }, [], { src: "clip.mp4" }),
      ]),
    ),
    "s",
  ).root;
  const nodes = flatten(root).filter((n) => n.kind === "image");
  expect(nodes).toMatchObject([
    { src: POSTER, contentMode: "contain" },
    { src: POSTER, alt: "Go", a11y: { trait: "isButton" } },
  ]);
  expect(nodes.map((n) => n.diagnostics.map((d) => `${d.level}:${d.feature}`))).toEqual([
    ["approximated:video"],
    ["approximated:input: image"],
  ]);
  // Without a poster there is no static picture: the placeholder stays.
  expect(flatten(root).some((n) => n.diagnostics.some((d) => d.level === "unmapped" && d.feature === "video"))).toBe(
    true,
  );
});
