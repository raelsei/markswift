/** A probe capture at another width keeps admitted runtime layouts only when it reproduces them. */
import { expect, test } from "bun:test";
import { type CompileResult, compileLayout, needsProbe } from "../../../src/compiler/index.ts";
import { admitTracks } from "../../../src/analysis/grid-tracks.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const BOX = { display: "block", "box-sizing": "border-box", "background-color": "rgb(220, 80, 60)" };

function doc(root: LayoutNode, screen = "probe"): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "probe.html",
    combo: { screen, theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    viewport: { x: 0, y: 0, w: root.bounds.w, h: root.bounds.h },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
}

const GROW = (i: number) => ({ "flex-grow": String(i + 1), "flex-shrink": "0", "flex-basis": "0px" });

/** A row (gap 8) of items with the captured widths; default `flex: 1 0 0px` / `flex: 2 0 0px`. */
function flexRow(
  width: number,
  widths: number[],
  screen?: string,
  flex: (i: number) => Record<string, string> = GROW,
  preferred = "auto",
): LayoutDoc {
  const items: LayoutNode[] = widths.map((w, i) => ({
    id: `item${i}`,
    tag: "div",
    attrs: {},
    preferredSize: { width: preferred, height: "auto" },
    bounds: { x: widths.slice(0, i).reduce((x, v) => x + v + 8, 0), y: 0, w, h: 40 },
    children: [],
    styles: { ...BOX, "min-width": "0px", "max-width": "none", ...flex(i) },
  }));
  const row: LayoutNode = {
    id: "row",
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: 0, y: 0, w: width, h: 40 },
    children: items,
    styles: { display: "flex", "flex-direction": "row", "flex-wrap": "nowrap", "column-gap": "8px" },
  };
  return doc(
    { id: "root", tag: "main", attrs: {}, bounds: { x: 0, y: 0, w: width, h: 40 }, children: [row], styles: BOX },
    screen,
  );
}

/** A `1fr 2fr` grid root (padding-left 12, gap 10) with the captured column widths. */
function frGrid(width: number, widths: [number, number]): LayoutDoc {
  const children: LayoutNode[] = widths.map((w, i) => ({
    id: `cell${i}`,
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: 12 + (i === 0 ? 0 : widths[0] + 10), y: 8, w, h: 20 },
    styles: BOX,
    children: [],
  }));
  return doc({
    id: "root",
    tag: "main",
    attrs: {},
    preferredSize: { width: `${width}px`, height: "200px", gridTemplateColumns: "1fr 2fr" },
    bounds: { x: 0, y: 0, w: width, h: 200 },
    children,
    styles: {
      display: "grid",
      "grid-template-columns": widths.map((w) => `${w}px`).join(" "),
      "grid-template-rows": "20px",
      "column-gap": "10px",
      "row-gap": "10px",
      "padding-left": "12px",
      "padding-top": "8px",
    },
  });
}

const app = (layout: LayoutDoc, probe: LayoutDoc) => compileLayout(layout, { name: "ProbeView", mode: "app", probe });
const features = (r: CompileResult, id: string) =>
  r.diagnostics.filter((d) => d.id === id).flatMap((d) => d.diagnostics.map((x) => x.feature));

const P1 = flexRow(340, [110.67, 221.33]);

test("a probe that follows the flex solver keeps MarkswiftFlexRow", () => {
  expect(needsProbe(P1)).toBe(true);
  expect(app(P1, flexRow(290, [94, 188])).code).toContain("MarkswiftFlexRow(");
});

test("a probe the flex solver does not reproduce pins the row with a diagnostic", () => {
  const result = app(P1, flexRow(290, [141, 141]));
  expect(result.code).not.toContain("MarkswiftFlexRow(");
  expect(features(result, "row")).toContain("flex-grow");
});

test("a wider probe where shrunk items no longer shrink still confirms the row", () => {
  const shrink = () => ({ "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto" });
  const row = (width: number, w: number) => flexRow(width, [w, w, w], undefined, shrink, "150px");
  expect(app(row(340, 108), row(600, 150)).code).toContain("MarkswiftFlexRow(");
  expect(app(row(340, 108), row(600, 120)).code).not.toContain("MarkswiftFlexRow(");
});

test("the same holds for an admitted 1fr 2fr grid", () => {
  const grid = frGrid(360, [112.67, 225.33]);
  expect(needsProbe(grid)).toBe(true);
  expect(app(grid, frGrid(300, [92.67, 185.33])).code).toContain("MarkswiftTracks(");
  const pinned = app(grid, frGrid(300, [139, 139]));
  expect(pinned.code).not.toContain("MarkswiftTracks(");
  expect(features(pinned, "root")).toContain("grid-template-columns");
});

test("a probe of another screen is rejected", () => {
  expect(() => app(P1, flexRow(290, [94, 188], "other"))).toThrow(
    "options.probe must be a capture of the same screen and theme at another width",
  );
});

/** A grid root (gaps 10, no padding) with an authored `template`; `items`: box plus extra styles and a one-line label. */
function placedGrid(
  width: number,
  template: string,
  items: Array<{ box: [number, number, number, number]; styles?: Record<string, string>; label?: boolean }>,
  root: Record<string, string> = {},
  rows?: string,
): LayoutDoc {
  const children: LayoutNode[] = items.map(({ box: [x, y, w, h], styles = {}, label }, i) => ({
    id: `cell${i}`,
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x, y, w, h },
    styles: { ...BOX, ...styles },
    children: label
      ? [
          {
            tag: "#text",
            attrs: {},
            styles: {},
            text: "Label",
            bounds: { x, y, w, h },
            lines: [{ bounds: { x, y, w, h: 10 }, start: 0, length: 5 }],
            children: [],
          },
        ]
      : [],
  }));
  return doc({
    id: "root",
    tag: "main",
    attrs: {},
    preferredSize: { width: `${width}px`, height: "200px", gridTemplateColumns: template, gridTemplateRows: rows },
    bounds: { x: 0, y: 0, w: width, h: 200 },
    children,
    styles: { display: "grid", "column-gap": "10px", "row-gap": "10px", ...root },
  });
}

/** The "auto rows + row span" grid: `1fr auto`, rows `auto auto`, `grid-auto-rows: 36px`, the Action spanning rows 1-2. */
function rowSpanGrid(width: number, actionRowEnd = "span 2"): LayoutDoc {
  const fr = width - 70;
  const span = actionRowEnd === "span 2";
  const action = {
    "grid-column-start": "2",
    "grid-row-start": "1",
    "grid-row-end": actionRowEnd,
    "justify-self": "end",
  };
  return placedGrid(
    width,
    "1fr auto",
    [
      { box: [0, 0, fr, span ? 20 : 50] },
      { box: [0, span ? 30 : 60, fr, 20] },
      { box: [fr + 10, 0, 60, 50], styles: action, label: true },
      // Without the span, auto-placement puts the last item beside the Description.
      span ? { box: [0, 60, fr, 36] } : { box: [fr + 10, 60, 60, 20], label: true },
    ],
    {
      "grid-template-columns": `${fr}px 60px`,
      "grid-template-rows": span ? "20px 20px 36px" : "50px 20px",
      "grid-auto-rows": "36px",
    },
    "auto auto",
  );
}

test("a placed grid keeps MarkswiftTracks when the probe reproduces its placement, else it is pinned", () => {
  const grid = rowSpanGrid(360);
  expect(app(grid, rowSpanGrid(300)).code).toContain("MarkswiftTracks(");
  // The probe itself admits; only its placement (the Action's row span) differs.
  expect(admitTracks(rowSpanGrid(300, "span 1").root)?.placements[2]).toMatchObject({ rowStart: 1, rowSpan: 1 });
  expect(admitTracks(rowSpanGrid(300, "span 1").root)?.placements[3]).toMatchObject({ colStart: 2, rowStart: 2 });
  const pinned = app(grid, rowSpanGrid(300, "span 1"));
  expect(pinned.code).not.toContain("MarkswiftTracks(");
  expect(features(pinned, "root")).toContain("display: grid");
});

test("an auto-fit grid stays admitted when the probe holds another column count", () => {
  const fit = (width: number, boxes: Array<[number, number, number, number]>) =>
    placedGrid(
      width,
      "repeat(auto-fit, minmax(100px, 1fr))",
      boxes.map((box) => ({ box })),
      {
        "grid-template-columns": boxes
          .filter((b) => b[1] === 0)
          .map((b) => `${b[2]}px`)
          .join(" "),
        "grid-template-rows": [...new Set(boxes.map((b) => b[1]))].map(() => "20px").join(" "),
      },
    );
  const grid = fit(360, [
    [0, 0, 113.333, 20],
    [123.333, 0, 113.333, 20],
    [246.667, 0, 113.333, 20],
  ]);
  const probe = fit(300, [
    [0, 0, 145, 20],
    [155, 0, 145, 20],
    [0, 30, 145, 20],
  ]);
  expect(app(grid, probe).code).toContain("MarkswiftTracks(");
});
