import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
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
  rows.root.preferredSize!.gridTemplateRows = "20px";
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
  const single = grid(authored("auto 1fr auto", autos, (d) => [0, 1, 2].forEach((i) => text(d, i, 1))));
  expect(single.template?.tracks.map((t) => t.kind)).toEqual(["auto", "fr", "auto"]);
  const wrapped = grid(authored("auto 1fr auto", autos, (d) => [0, 1, 2].forEach((i) => text(d, i, i === 0 ? 2 : 1))));
  expect(wrapped.template).toBeUndefined();
  expect(pinned(wrapped)).toBe(true);
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
])("no admission: %s", (_label, doc) => {
  const n = grid(doc);
  expect(n.template).toBeUndefined();
  expect(pinned(n)).toBe(true);
});
