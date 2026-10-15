import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { placeItems } from "../../../src/analysis/grid-tracks.ts";
import type { GridNode } from "../../../src/model/semantic.ts";

function capture(
  columns: string,
  rows: string,
  boxes: Array<[number, number, number, number]>,
  styles: Record<string, string> = {},
): LayoutDoc {
  const children: LayoutNode[] = boxes.map(([x, y, w, h], i) => ({
    id: `cell${i}`,
    tag: "div",
    attrs: {},
    bounds: { x: x + 12, y: y + 8, w, h },
    styles: { display: "block", "box-sizing": "border-box", "background-color": "rgb(220, 80, 60)" },
    children: [],
  }));
  return {
    version: LAYOUT_DOC_VERSION,
    source: "grid.html",
    combo: { screen: "grid", theme: "light" },
    size: { w: 360, h: 200 },
    viewport: { x: 0, y: 0, w: 360, h: 200 },
    conditions: [],
    dpr: 1,
    canvas: "white",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      preferredSize: { width: "360px", height: "200px" },
      bounds: { x: 0, y: 0, w: 360, h: 200 },
      children,
      styles: {
        display: "grid",
        "grid-template-columns": columns,
        "grid-template-rows": rows,
        "column-gap": "10px",
        "row-gap": "10px",
        "padding-left": "12px",
        "padding-top": "8px",
        ...styles,
      },
    },
  };
}

function grid(input: LayoutDoc): GridNode {
  const node = inferScreen(input, "Grid").root;
  if (node.kind !== "grid") throw new Error("Expected grid");
  return node;
}

// Removing measured placement or reintroducing sequential chunking must fail these cases.
test("grid preserves a hole before a later row", () => {
  const input = capture("100px 100px 100px", "20px 20px", [
    [0, 0, 100, 20],
    [220, 0, 100, 20],
    [0, 30, 100, 20],
    [110, 30, 100, 20],
    [220, 30, 100, 20],
  ]);
  const n = grid(input);
  expect(n.columns).toBe(3);
  expect(n.measured?.frames).toEqual(
    input.root.children.map((c) => ({ ...c.bounds, x: c.bounds.x - 12, y: c.bounds.y - 8 })),
  );
  expect(n.diagnostics.map((d) => d.message).join("\n")).toContain("captured grid placement");
});

test("aligned intrinsic items cannot invent additional columns", () => {
  const input = capture("100px 100px", "20px 20px", [
    [80, 0, 20, 20],
    [170, 0, 40, 20],
    [60, 30, 40, 20],
    [190, 30, 20, 20],
  ]);
  expect(grid(input).columns).toBe(2);
  expect(grid(input).measured).toBeDefined();
});

test.each([
  [
    "empty middle track",
    "100px 100px 100px",
    "20px",
    [
      [0, 0, 100, 20],
      [220, 0, 100, 20],
    ],
  ],
  ["empty last track", "100px 100px 100px", "20px", [[0, 0, 100, 20]]],
  [
    "empty row",
    "100px 100px",
    "20px 20px 20px",
    [
      [0, 0, 100, 20],
      [110, 60, 100, 20],
    ],
  ],
  [
    "column span",
    "100px 100px",
    "20px 20px",
    [
      [0, 0, 210, 20],
      [0, 30, 100, 20],
      [110, 30, 100, 20],
    ],
  ],
  [
    "row span",
    "100px 100px",
    "20px 20px",
    [
      [0, 0, 100, 50],
      [110, 0, 100, 20],
      [110, 30, 100, 20],
    ],
  ],
  [
    "overlapping cells",
    "100px 100px",
    "20px",
    [
      [0, 0, 100, 20],
      [0, 0, 100, 20],
    ],
  ],
  [
    "collapsed auto-fit track",
    "100px 0px 100px",
    "20px",
    [
      [0, 0, 100, 20],
      [110, 0, 100, 20],
    ],
  ],
  [
    "legacy unknown track sizing",
    "repeat(2, 1fr)",
    "none",
    [
      [0, 0, 100, 20],
      [110, 0, 100, 20],
    ],
  ],
] as const)("%s keeps measured placement", (_label, columns, rows, boxes) => {
  const input = capture(
    columns,
    rows,
    boxes.map((b) => [...b]),
  );
  const n = grid(input);
  expect(n.measured).toBeDefined();
  expect(n.children).toHaveLength(boxes.length);
  expect(n.measured?.width).toBe(348);
  expect(n.measured?.height).toBe(192);
  expect(n.children.map((c) => c.width.kind)).toEqual(boxes.map(() => "fixed"));
});

test("unequal tracks cannot retain filling child widths", () => {
  const input = capture("100px 200px", "20px", [
    [0, 0, 100, 20],
    [110, 0, 200, 20],
  ]);
  input.root.children.forEach((c) => {
    c.attrs.style = "width:100%";
    c.preferredSize = { width: "100%", height: "auto" };
  });
  const n = grid(input);
  expect(n.children.map((c) => c.width)).toEqual([
    { kind: "fixed", px: 100 },
    { kind: "fixed", px: 200 },
  ]);
  expect(n.measured).toBeUndefined();
});

test("complete regular equal tracks retain native fill when they occupy the content width", () => {
  const input = capture("[start] 100px [middle] 100px [end]", "20px 20px", [
    [0, 0, 100, 20],
    [110, 0, 100, 20],
    [0, 30, 100, 20],
    [110, 30, 100, 20],
  ]);
  input.root.bounds.w = 222;
  input.size.w = 222;
  const n = grid(input);
  expect(n.columns).toBe(2);
  expect(n.measured).toBeUndefined();
  expect(n.children.every((c) => c.width.kind === "fill")).toBe(true);
});

test("RTL and reordered areas preserve coordinates and DOM paint order", () => {
  const input = capture(
    "100px 100px",
    "20px 20px",
    [
      [110, 30, 100, 20],
      [0, 0, 100, 20],
      [110, 0, 100, 20],
      [0, 30, 100, 20],
    ],
    { direction: "rtl" },
  );
  const n = grid(input);
  expect(n.measured).toBeDefined();
  expect(n.children.map((c) => c.id)).toEqual(["cell0", "cell1", "cell2", "cell3"]);
  expect(n.measured?.frames[0]).toMatchObject({ x: 110, y: 30 });
});

test("native emission retains measured content extent and cell proposals in both modes", () => {
  const input = capture("100px 100px 100px", "20px 20px", [
    [0, 0, 100, 20],
    [220, 0, 100, 20],
    [0, 30, 100, 20],
  ]);
  for (const mode of ["app", "fidelity"] as const) {
    const code = compileLayout(input, { name: "GridView", mode }).code;
    expect(code).toContain("MarkswiftMeasuredLayout(");
    expect(code).toContain("CGRect(x: 220.0, y: 0.0, width: 100.0, height: 20.0)");
    expect(code).toContain("width: 348.0, height: 192.0");
  }
});

test("measured overlapping cells retain CSS paint order", () => {
  const input = capture("100px", "20px", [
    [0, 0, 100, 20],
    [0, 0, 100, 20],
  ]);
  input.root.children[0]!.paint = 9;
  input.root.children[1]!.paint = 3;
  expect(grid(input).children.map((child) => child.id)).toEqual(["cell1", "cell0"]);
});

test("a grid keeps its absolutely positioned decoration", () => {
  const input = capture("100px", "20px", [[0, 0, 100, 20]]);
  input.root.children.push({
    id: "decoration",
    tag: "div",
    attrs: {},
    styles: { position: "absolute", "background-color": "rgb(60, 120, 220)" },
    bounds: { x: 32, y: 12, w: 30, h: 10 },
    children: [],
  });
  expect(grid(input).overlays).toHaveLength(1);
  expect(grid(input).overlays[0]!.offset).toEqual([32, 12]);
});

test("an equal-fill auto-fit grid carries its pinned column count to fidelity, or reports it when not admitted", () => {
  const plain = capture("109.333px 109.333px 109.333px", "20px", [
    [0, 0, 109.333, 20],
    [119.333, 0, 109.333, 20],
    [238.667, 0, 109.333, 20],
  ]);
  const input = structuredClone(plain);
  input.root.preferredSize = {
    width: "360px",
    height: "200px",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
  };
  const message = "repeat(auto-fit, minmax(100px, 1fr)) pinned at 3 columns";
  expect(grid(input).template?.fidelityNote).toContain(message);
  const rows = structuredClone(input);
  rows.root.preferredSize!.gridTemplateRows = "40px";
  const pins = grid(rows).diagnostics.filter((d) => d.feature === "grid-template-columns");
  expect(pins.map((d) => d.message).join("\n")).toContain(message);
  expect(grid(plain).diagnostics.filter((d) => d.feature === "grid-template-columns")).toEqual([]);
});

/** A one-row grid whose root records the authored template (Typed OM); `edit` adjusts the capture. */
function authored(
  template: string,
  boxes: Array<[number, number, number, number]>,
  edit: (doc: LayoutDoc) => void = () => {},
): LayoutDoc {
  const doc = capture(boxes.map((b) => `${b[2]}px`).join(" "), "20px", boxes);
  doc.root.preferredSize = { width: "360px", height: "200px", gridTemplateColumns: template };
  edit(doc);
  return doc;
}
/** Gives cell `i` a text child laid out on `lines` line boxes. */
function text(doc: LayoutDoc, i: number, lines: number) {
  const cell = doc.root.children[i]!;
  cell.children.push({
    tag: "#text",
    attrs: {},
    styles: {},
    text: "Label",
    bounds: { ...cell.bounds },
    lines: Array.from({ length: lines }, (_, l) => ({
      bounds: { ...cell.bounds, y: cell.bounds.y + l * 10, h: 10 },
      start: 0,
      length: 5,
    })),
    children: [],
  });
}
const FR_1_2: Array<[number, number, number, number]> = [
  [0, 0, 112.67, 20],
  [122.67, 0, 225.33, 20],
];
const pinned = (n: GridNode) =>
  n.diagnostics.some((d) => d.feature === "grid-template-columns" || d.feature === "display: grid");

test("an fr template the solver reproduces is admitted; children keep their captured widths", () => {
  const n = grid(authored("1fr 2fr", FR_1_2));
  expect(n.template).toEqual({
    tracks: [
      { kind: "fr", fr: 1 },
      { kind: "fr", fr: 2 },
    ],
    stretch: true,
    items: [
      { child: 0, margin: [0, 0], fixed: false, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1, justify: "stretch" },
      { child: 1, margin: [0, 0], fixed: false, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1, justify: "stretch" },
    ],
    fidelityNote: expect.stringContaining("fixed column widths") as unknown as string,
  });
  expect(n.diagnostics.filter((d) => d.feature === "grid-template-columns")).toEqual([]);
  expect(n.children.map((c) => c.width)).toEqual([
    { kind: "fixed", px: 112.67 },
    { kind: "fixed", px: 225.33 },
  ]);
});

test("px + fr and auto + fr templates are admitted", () => {
  const pxFr = grid(
    authored("100px 1fr", [
      [0, 0, 100, 20],
      [110, 0, 238, 20],
    ]),
  );
  expect(pxFr.template?.tracks).toEqual([
    { kind: "px", px: 100 },
    { kind: "fr", fr: 1 },
  ]);
  const autos: Array<[number, number, number, number]> = [
    [0, 0, 40, 20],
    [50, 0, 252, 20],
    [312, 0, 36, 20],
  ];
  const withText = (lines: number[]) => (d: LayoutDoc) => {
    for (const [i, n] of lines.entries()) text(d, i, n);
  };
  const single = grid(authored("auto 1fr auto", autos, withText([1, 1, 1])));
  expect(single.template?.tracks.map((t) => t.kind)).toEqual(["auto", "fr", "auto"]);
  const wrapped = grid(authored("auto 1fr auto", autos, withText([2, 1, 1])));
  expect(wrapped.template).toBeUndefined();
  expect(pinned(wrapped)).toBe(true);
});

// core-alpha's #minimum (tests/integration/allocated-layout.test.ts) in a 348px content box: 1fr would be 88px.
test("a minmax(px, fr) floor freezes its track and the other fr tracks share the rest", () => {
  const doc = authored("64px minmax(100px, 1fr) minmax(0px, 2fr)", [
    [0, 0, 64, 20],
    [74, 0, 100, 20],
    [184, 0, 164, 20],
  ]);
  expect(grid(doc).template?.tracks).toEqual([
    { kind: "px", px: 64 },
    { kind: "fr", fr: 1, min: 100 },
    { kind: "fr", fr: 2 },
  ]);
  expect(compileLayout(doc, { name: "GridView", mode: "app" }).code).toContain(
    "MarkswiftTracks(tracks: [.px(64.0), .fr(1.0, min: 100.0), .fr(2.0)]",
  );
});

test("auto-fill and auto-fit templates are admitted with their minimum", () => {
  const cells: Array<[number, number, number, number]> = [
    [0, 0, 109.333, 20],
    [119.333, 0, 109.333, 20],
    [238.667, 0, 109.333, 20],
  ];
  expect(grid(authored("repeat(auto-fill, minmax(100px, 1fr))", cells)).template?.autoRepeat).toEqual({
    mode: "fill",
    min: 100,
  });
  expect(grid(authored("repeat(auto-fit, minmax(100px, 1fr))", cells)).template?.autoRepeat).toEqual({
    mode: "fit",
    min: 100,
  });
});

test("authored px tracks the capture reproduces are exact: no template, no diagnostic", () => {
  const n = grid(
    authored("120px 120px", [
      [0, 0, 120, 20],
      [130, 0, 120, 20],
    ]),
  );
  expect(n.template).toBeUndefined();
  expect(n.diagnostics.filter((d) => d.feature === "grid-template-columns")).toEqual([]);
});

// A false admission silently mis-sizes the grid at every other width.
test.each<[string, LayoutDoc]>([
  [
    "captured tracks 2px off the solver",
    authored("1fr 2fr", [
      [0, 0, 114.67, 20],
      [124.67, 0, 223.33, 20],
    ]),
  ],
  [
    "explicit grid-template-rows",
    authored("1fr 2fr", FR_1_2, (d) => {
      d.root.preferredSize!.gridTemplateRows = "40px";
    }),
  ],
  ["direction: rtl", authored("1fr 2fr", FR_1_2, (d) => void (d.root.styles.direction = "rtl"))],
  ["grid-auto-flow: column", authored("1fr 2fr", FR_1_2, (d) => void (d.root.styles["grid-auto-flow"] = "column"))],
  [
    "an item with a side margin",
    authored("1fr 2fr", FR_1_2, (d) => void (d.root.children[1]!.styles["margin-left"] = "4px")),
  ],
  [
    "an item with a px height",
    authored("1fr 2fr", FR_1_2, (d) => void (d.root.children[0]!.preferredSize = { width: "auto", height: "40px" })),
  ],
  [
    "an item with a px width but a content height",
    authored(
      "1fr 2fr",
      FR_1_2,
      (d) => void (d.root.children[0]!.preferredSize = { width: "112.67px", height: "auto" }),
    ),
  ],
  ["align-items: center", authored("1fr 2fr", FR_1_2, (d) => void (d.root.styles["align-items"] = "center"))],
  ["a percentage track", authored("50% 1fr", FR_1_2)],
  [
    "a column-spanning first item",
    (() => {
      const doc = capture("100px 100px", "20px 20px", [
        [0, 0, 210, 20],
        [0, 30, 100, 20],
        [110, 30, 100, 20],
      ]);
      doc.root.preferredSize = { width: "360px", height: "200px", gridTemplateColumns: "1fr 1fr" };
      return doc;
    })(),
  ],
  [
    "an item placed in a later row, leaving an empty row",
    (() => {
      const doc = capture("169px 169px", "20px 20px 20px", [
        [0, 0, 169, 20],
        [179, 60, 169, 20],
      ]);
      doc.root.preferredSize = { width: "360px", height: "200px", gridTemplateColumns: "1fr 1fr" };
      return doc;
    })(),
  ],
  [
    "rows offset from the content box (align-content)",
    authored(
      "1fr 2fr",
      FR_1_2.map(([x, y, w, h]) => [x, y + 20, w, h]),
      (d) => void (d.root.styles["grid-template-rows"] = "20px"),
    ),
  ],
])("no admission: %s", (_label, doc) => {
  const n = grid(doc);
  expect(n.template).toBeUndefined();
  expect(pinned(n)).toBe(true);
});

test("align-items: start cells shorter than their row are admitted; fidelity keeps the measured layout", () => {
  const input = authored(
    "1fr auto",
    [
      [0, 0, 300, 40],
      [310, 0, 38, 20],
    ],
    (d) => {
      d.root.styles["grid-template-rows"] = "40px";
      d.root.styles["align-items"] = "start";
      text(d, 1, 1);
    },
  );
  const n = grid(input);
  expect(n.measured).toBeDefined();
  expect(n.template).toMatchObject({ tracks: [{ kind: "fr", fr: 1 }, { kind: "auto" }], stretch: false });
  expect(n.diagnostics.filter((d) => d.feature === "display: grid")).toEqual([]);
  const app = compileLayout(input, { name: "GridView", mode: "app" }).code;
  expect(app).toContain("MarkswiftTracks(tracks: [.fr(1.0), .auto], hSpacing: 10.0, vSpacing: 10.0, stretch: false) {");
  expect(app).not.toContain("MarkswiftMeasuredLayout(");
  const plain = structuredClone(input);
  delete plain.root.preferredSize!.gridTemplateColumns;
  const fidelity = compileLayout(input, { name: "GridView", mode: "fidelity" });
  const reference = compileLayout(plain, { name: "GridView", mode: "fidelity" });
  expect(fidelity.code).toBe(reference.code);
  expect(fidelity.diagnostics).toEqual(reference.diagnostics);
});

test("a px-sized icon painted last keeps its frame and its DOM cell in an auto column", () => {
  const input = authored(
    "auto 1fr",
    [
      [0, 2, 16, 16],
      [26, 0, 322, 40],
    ],
    (d) => {
      d.root.styles["grid-template-rows"] = "40px";
      d.root.styles["align-items"] = "start";
      d.root.children[0]!.styles["margin-top"] = "2px";
      d.root.children[0]!.preferredSize = { width: "16px", height: "16px" };
      d.root.children[0]!.paint = 9;
      d.root.children[1]!.paint = 3;
    },
  );
  const n = grid(input);
  expect(n.children.map((c) => c.id)).toEqual(["cell1", "cell0"]);
  expect(n.template).toMatchObject({
    tracks: [{ kind: "auto" }, { kind: "fr", fr: 1 }],
    items: [
      { child: 1, margin: [2, 0], fixed: true, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1, justify: "stretch" },
      { child: 0, margin: [0, 0], fixed: false, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1, justify: "stretch" },
    ],
  });
  const app = compileLayout(input, { name: "GridView", mode: "app" }).code;
  const head = "MarkswiftTracks(tracks: [.auto, .fr(1.0)], hSpacing: 10.0, vSpacing: 10.0, stretch: false) {";
  expect(app).toContain(head);
  const tracks = app.slice(app.indexOf(head));
  // The icon (DOM cell 0) comes first, keeps its frame and its 2px top margin.
  expect(tracks).toMatch(/\.frame\(width: 16\.0, height: 16\.0[^\n]*\n(?:[^\n]*\n)*?\s*\.padding\(\.top, 2\.0\)/);
  expect(tracks.indexOf(".frame(width: 16.0, height: 16.0")).toBeLessThan(tracks.indexOf(".frame(maxWidth: .infinity"));
});

test("app emits MarkswiftTracks with allocated cells; fidelity is byte-identical to the unadmitted grid", () => {
  const input = authored("1fr 2fr", FR_1_2);
  const app = compileLayout(input, { name: "GridView", mode: "app" }).code;
  expect(app).toContain("MarkswiftTracks(tracks: [.fr(1.0), .fr(2.0)], hSpacing: 10.0, vSpacing: 10.0) {");
  expect(app).toContain(".frame(maxWidth: .infinity");
  expect(app).not.toContain(".frame(width: 112.67");
  expect(app).not.toContain("markswiftGridCell");
  expect(app).not.toContain("rows:");
  const plain = structuredClone(input);
  delete plain.root.preferredSize!.gridTemplateColumns;
  const fidelity = compileLayout(input, { name: "GridView", mode: "fidelity" });
  const reference = compileLayout(plain, { name: "GridView", mode: "fidelity" });
  expect(fidelity.code).toBe(reference.code);
  expect(fidelity.diagnostics).toEqual(reference.diagnostics);
  expect(fidelity.diagnostics.flatMap((d) => d.diagnostics).map((d) => d.feature)).toContain("grid-template-columns");
});

test("auto-repeat without stretch emits its minimum and stretch: false", () => {
  const input = authored(
    "repeat(auto-fill, minmax(100px, 1fr))",
    [
      [0, 0, 109.333, 20],
      [119.333, 0, 109.333, 20],
      [238.667, 0, 109.333, 20],
    ],
    (d) => void (d.root.styles["align-items"] = "start"),
  );
  expect(compileLayout(input, { name: "GridView", mode: "app" }).code).toContain(
    "MarkswiftTracks(autoRepeat: .fill(min: 100.0), hSpacing: 10.0, vSpacing: 10.0, stretch: false) {",
  );
});

test.each<[string, number, Parameters<typeof placeItems>[1], Array<[number, number]> | undefined]>([
  [
    "probe grid: implicit third row",
    3,
    [
      { col: { span: 2 }, row: { start: 1, span: 2 } },
      { col: { start: 3, span: 1 }, row: { start: 1, span: 1 } },
      { col: { start: 3, span: 1 }, row: { start: 2, span: 1 } },
      { col: { span: 1 }, row: { span: 1 } },
    ],
    [
      [1, 1],
      [3, 1],
      [3, 2],
      [1, 3],
    ],
  ],
  [
    "card header action",
    2,
    [
      { col: { span: 1 }, row: { span: 1 } },
      { col: { span: 1 }, row: { span: 1 } },
      { col: { start: 2, span: 1 }, row: { start: 1, span: 2 } },
    ],
    [
      [1, 1],
      [1, 2],
      [2, 1],
    ],
  ],
  [
    "holes",
    3,
    [
      { col: { start: 3, span: 1 }, row: { span: 1 } },
      { col: { start: 1, span: 1 }, row: { start: 2, span: 1 } },
      { col: { span: 1 }, row: { span: 1 } },
    ],
    [
      [3, 1],
      [1, 2],
      [2, 2],
    ],
  ],
  ["an implicit column", 2, [{ col: { start: 3, span: 1 }, row: { span: 1 } }], undefined],
  [
    "two items in one cell",
    2,
    [
      { col: { start: 1, span: 1 }, row: { start: 1, span: 1 } },
      { col: { start: 1, span: 1 }, row: { start: 1, span: 1 } },
    ],
    undefined,
  ],
])("placeItems: %s", (_label, k, items, expected) => {
  expect(placeItems(k, items)).toEqual(expected);
});

/** A 360px grid (content 348, gaps 10) with an authored template and the computed px tracks. */
function placed(
  template: string | undefined,
  columns: string,
  rows: string,
  boxes: Array<[number, number, number, number]>,
  edit: (doc: LayoutDoc) => void = () => {},
): LayoutDoc {
  const doc = capture(columns, rows, boxes);
  if (template) doc.root.preferredSize = { width: "360px", height: "200px", gridTemplateColumns: template };
  edit(doc);
  return doc;
}
const setStyles = (node: LayoutNode, styles: Record<string, string>) => Object.assign(node.styles, styles);
const area = (name: string) => ({
  "grid-column-start": name,
  "grid-column-end": name,
  "grid-row-start": name,
  "grid-row-end": name,
});
const POSITIVES: Record<string, () => LayoutDoc> = {
  span: () =>
    placed(
      "1fr 1fr",
      "169px 169px",
      "20px 20px",
      [
        [0, 0, 348, 20],
        [0, 30, 169, 20],
        [179, 30, 169, 20],
      ],
      (d) => void setStyles(d.root.children[0]!, { "grid-column-start": "span 2" }),
    ),
  areas: () =>
    placed(
      "100px 1fr",
      "100px 238px",
      "20px 20px",
      [
        [110, 30, 238, 20],
        [0, 30, 100, 20],
        [0, 0, 348, 20],
      ],
      (d) => {
        d.root.styles["grid-template-areas"] = '"head head" "side main"';
        for (const [i, name] of ["main", "side", "head"].entries()) setStyles(d.root.children[i]!, area(name));
      },
    ),
  holes: () =>
    placed(
      "repeat(3, 1fr)",
      "109.333px 109.333px 109.333px",
      "20px 20px",
      [
        [238.667, 0, 109.333, 20],
        [0, 30, 109.333, 20],
        [119.333, 30, 109.333, 20],
      ],
      (d) => {
        setStyles(d.root.children[0]!, { "grid-column-start": "3" });
        setStyles(d.root.children[1]!, { "grid-column-start": "1", "grid-row-start": "2" });
      },
    ),
  justify: () => justify(1),
  rows: () =>
    placed(
      "1fr auto",
      "278px 60px",
      "20px 20px 36px",
      [
        [0, 0, 278, 20],
        [0, 30, 278, 20],
        [288, 0, 60, 50],
        [0, 60, 278, 36],
      ],
      (d) => {
        d.root.preferredSize!.gridTemplateRows = "auto auto";
        d.root.styles["grid-auto-rows"] = "36px";
        setStyles(d.root.children[2]!, {
          "grid-column-start": "2",
          "grid-row-start": "1",
          "grid-row-end": "span 2",
          "justify-self": "end",
        });
        text(d, 2, 1);
      },
    ),
  implicit: () =>
    placed(
      undefined,
      "348px",
      "11px 11px 20px 20px",
      [
        [0, 0, 24, 24],
        [0, 26, 348, 20],
        [0, 48, 348, 20],
      ],
      (d) => {
        setStyles(d.root, { "grid-auto-columns": "auto", "row-gap": "2px" });
        d.root.children[0]!.preferredSize = { width: "24px", height: "24px" };
        setStyles(d.root.children[0]!, { "grid-row-start": "span 2", "grid-row-end": "span 2" });
      },
    ),
};
/** `justify-items: start`; Start (auto), End, Center and Stretch; `endLines`: the End cell's text lines. */
function justify(endLines: number): LayoutDoc {
  return placed(
    "1fr 1fr",
    "169px 169px",
    "20px 20px",
    [
      [0, 0, 50, 20],
      [308, 0, 40, 20],
      [54.5, 30, 60, 20],
      [179, 30, 169, 20],
    ],
    (d) => {
      d.root.styles["justify-items"] = "start";
      for (const [i, js] of ["auto", "end", "center", "stretch"].entries()) {
        if (js !== "auto") d.root.children[i]!.styles["justify-self"] = js;
        text(d, i, i === 1 ? endLines : 1);
      }
    },
  );
}
const at = (n: GridNode) => n.template?.items.map((it) => [it.colStart, it.rowStart, it.colSpan, it.rowSpan]);

test("grid placement: spans, areas and holes are admitted with their resolved cells", () => {
  expect(at(grid(POSITIVES.span!()))).toEqual([
    [1, 1, 2, 1],
    [1, 2, 1, 1],
    [2, 2, 1, 1],
  ]);
  const areas = grid(POSITIVES.areas!());
  expect(at(areas)).toEqual([
    [2, 2, 1, 1],
    [1, 2, 1, 1],
    [1, 1, 2, 1],
  ]);
  expect(areas.template?.tracks).toEqual([
    { kind: "px", px: 100 },
    { kind: "fr", fr: 1 },
  ]);
  expect(at(grid(POSITIVES.holes!()))).toEqual([
    [3, 1, 1, 1],
    [1, 2, 1, 1],
    [2, 2, 1, 1],
  ]);
});

test("grid placement: justify-self and justify-items resolve; justified cells hug their content", () => {
  const n = grid(POSITIVES.justify!());
  expect(n.template?.items.map((it) => it.justify)).toEqual(["start", "end", "center", "stretch"]);
  expect(n.children.slice(0, 3).map((c) => c.width)).toEqual([
    { kind: "fixed", px: 50, hug: true },
    { kind: "fixed", px: 40, hug: true },
    { kind: "fixed", px: 60, hug: true },
  ]);
});

test("grid placement: explicit auto rows, a px grid-auto-rows and a row span", () => {
  const n = grid(POSITIVES.rows!());
  expect(n.template).toMatchObject({
    tracks: [{ kind: "fr", fr: 1 }, { kind: "auto" }],
    rows: [{ kind: "auto" }, { kind: "auto" }],
    autoRow: { kind: "px", px: 36 },
  });
  expect(n.template?.items[2]).toMatchObject({ colStart: 2, rowStart: 1, rowSpan: 2, justify: "end" });
  expect(at(n)?.[3]).toEqual([1, 3, 1, 1]);
});

test("grid placement: one implicit auto column is a 1fr track (shadcn Alert)", () => {
  const n = grid(POSITIVES.implicit!());
  expect(n.template?.tracks).toEqual([{ kind: "fr", fr: 1 }]);
  expect(n.template?.rows).toBeUndefined();
  expect(n.template?.items.map((it) => [it.colStart, it.rowStart, it.rowSpan, it.fixed])).toEqual([
    [1, 1, 2, true],
    [1, 3, 1, false],
    [1, 4, 1, false],
  ]);
});

test.each<[string, LayoutDoc]>([
  ["a template line name", POSITIVES.span!()],
  ["span <name>", POSITIVES.span!()],
  ["a line past the explicit columns", POSITIVES.span!()],
  ["two items in one cell", POSITIVES.holes!()],
  ["grid-auto-flow: row dense", POSITIVES.span!()],
  ["an item with order: 1", POSITIVES.span!()],
  ["justify-self: safe end", POSITIVES.justify!()],
  ["grid-auto-rows: minmax(10px, auto)", POSITIVES.rows!()],
  ["grid-auto-rows: 30px 40px", POSITIVES.rows!()],
  ["a justified item with wrapped text and no px width", justify(2)],
  ["a column span over an auto track", POSITIVES.span!()],
  ["one implicit column without grid-auto-columns", POSITIVES.implicit!()],
  ["one implicit column with justify-content: center", POSITIVES.implicit!()],
  ["an item 2px below its row", POSITIVES.implicit!()],
  [
    "an auto-fill grid with a placed item",
    authored(
      "repeat(auto-fill, minmax(100px, 1fr))",
      [
        [0, 0, 109.333, 20],
        [119.333, 0, 109.333, 20],
        [238.667, 0, 109.333, 20],
      ],
      (d) => void (d.root.children[1]!.styles["grid-column-start"] = "2"),
    ),
  ],
])("no placement admission: %s", (label, doc) => {
  const kids = doc.root.children;
  const EDITS: Record<string, () => void> = {
    "a template line name": () => void (kids[0]!.styles["grid-column-start"] = "a"),
    "span <name>": () => void (kids[0]!.styles["grid-column-start"] = "span x"),
    "a line past the explicit columns": () => void (kids[1]!.styles["grid-column-start"] = "3"),
    "two items in one cell": () => {
      for (const k of kids.slice(0, 2)) setStyles(k, { "grid-column-start": "1", "grid-row-start": "1" });
    },
    "grid-auto-flow: row dense": () => void (doc.root.styles["grid-auto-flow"] = "row dense"),
    "an item with order: 1": () => void (kids[1]!.styles.order = "1"),
    "justify-self: safe end": () => void (kids[1]!.styles["justify-self"] = "safe end"),
    "grid-auto-rows: minmax(10px, auto)": () => void (doc.root.styles["grid-auto-rows"] = "minmax(10px, auto)"),
    "grid-auto-rows: 30px 40px": () => void (doc.root.styles["grid-auto-rows"] = "30px 40px"),
    "a column span over an auto track": () => void (doc.root.preferredSize!.gridTemplateColumns = "auto 1fr"),
    "one implicit column without grid-auto-columns": () => void delete doc.root.styles["grid-auto-columns"],
    "one implicit column with justify-content: center": () => void (doc.root.styles["justify-content"] = "center"),
    "an item 2px below its row": () => void (kids[1]!.bounds.y += 2),
  };
  EDITS[label]?.();
  const n = grid(doc);
  expect(n.template).toBeUndefined();
  expect(pinned(n)).toBe(true);
});

test("placed grids emit rows and .markswiftGridCell in app; fidelity is byte-identical to the unadmitted grid", () => {
  const app = (doc: LayoutDoc) => compileLayout(doc, { name: "GridView", mode: "app" }).code;
  const rows = app(POSITIVES.rows!());
  expect(rows).toContain(
    "MarkswiftTracks(tracks: [.fr(1.0), .auto], rows: [.auto, .auto], autoRow: .px(36.0), hSpacing: 10.0, vSpacing: 10.0) {",
  );
  expect(rows).toContain(".markswiftGridCell(column: 2, row: 1, rowSpan: 2, justify: .end)");
  expect(rows).toContain(".markswiftGridCell(column: 1, row: 3)");
  expect(rows).toContain(".markswiftFitWidth()");
  expect(app(POSITIVES.span!())).toContain(".markswiftGridCell(column: 1, row: 1, columnSpan: 2)");
  const implicit = app(POSITIVES.implicit!());
  expect(implicit).toContain("MarkswiftTracks(tracks: [.fr(1.0)], hSpacing: 10.0, vSpacing: 2.0) {");
  expect(implicit).toContain(".markswiftGridCell(column: 1, row: 1, rowSpan: 2)");
  for (const [name, make] of Object.entries(POSITIVES)) {
    const input = make();
    expect(grid(input).template, name).toBeDefined();
    const plain = structuredClone(input);
    delete plain.root.preferredSize?.gridTemplateColumns;
    delete plain.root.styles["grid-auto-columns"];
    const fidelity = compileLayout(input, { name: "GridView", mode: "fidelity" });
    const reference = compileLayout(plain, { name: "GridView", mode: "fidelity" });
    expect(fidelity.code, name).toBe(reference.code);
    expect(fidelity.diagnostics, name).toEqual(reference.diagnostics);
  }
});
