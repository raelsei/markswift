/** Plan 049: table slot admission, the fixed-layout solver and MarkswiftTable emission. */
import { describe, expect, test } from "bun:test";
import { solveTableColumns, tableSlots } from "../../../src/analysis/table.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { TableColumn } from "../../../src/model/semantic.ts";
import { border, box, collapsed, doc, padding, separated, table, text, type TableSpec } from "../../helpers/tables.ts";

const near = (a: number[], b: number[], tol = 0.01) => {
  expect(a).toHaveLength(b.length);
  for (const [i, v] of a.entries()) expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(tol);
};
const slotOf = ({
  rowStart,
  colStart,
  rowSpan,
  colSpan,
}: {
  rowStart: number;
  colStart: number;
  rowSpan: number;
  colSpan: number;
}) => ({
  rowStart,
  colStart,
  rowSpan,
  colSpan,
});
const px = (n: number): TableColumn => ({ kind: "px", px: n });
const pct = (fraction: number, plus: number): TableColumn => ({ kind: "percent", fraction, plus });
const auto: TableColumn = { kind: "auto" };
/** Every node of `t` matching `tag`, depth-first. */
const all = (t: LayoutNode, tag: string): LayoutNode[] => [
  ...(t.tag === tag ? [t] : []),
  ...t.children.flatMap((c) => all(c, tag)),
];
const two: TableSpec = {
  widths: [100, 100],
  heights: [30],
  h: 2,
  v: 2,
  cells: [
    { row: 0, col: 0, text: "x" },
    { row: 0, col: 1, text: "y" },
  ],
};

describe("tableSlots admits", () => {
  test("the separated probe: slots, columns, rows, spacing", () => {
    const s = tableSlots(separated())!;
    expect(s.cells.map(slotOf)).toEqual([
      { rowStart: 1, colStart: 1, rowSpan: 1, colSpan: 2 },
      { rowStart: 1, colStart: 3, rowSpan: 2, colSpan: 1 },
      { rowStart: 2, colStart: 1, rowSpan: 1, colSpan: 1 },
      { rowStart: 2, colStart: 2, rowSpan: 1, colSpan: 1 },
    ]);
    near(s.widths, [88.688, 93.641, 93.672]);
    near(s.heights, [26, 26]);
    expect([s.hSpacing, s.vSpacing, s.collapse, s.widthFixed, s.fixedRequested]).toEqual([3, 5, false, true, false]);
    expect(s.bands).toEqual([]);
  });

  test("a collapsed `width: 100%` table: no spacing, width not fixed", () => {
    const s = tableSlots(collapsed())!;
    expect([s.hSpacing, s.vSpacing, s.collapse, s.widthFixed]).toEqual([0, 0, true, false]);
    expect(s.cells.map((c) => c.node.tag)).toEqual(["th", "th", "td", "td"]);
  });

  test("a collapsed table's painted tfoot is one band across every column, before the cells", () => {
    const s = tableSlots(
      table({
        widths: [60, 60, 60],
        heights: [30, 30, 30],
        collapse: true,
        groups: [
          { tag: "tbody", display: "table-row-group", rows: [0, 1] },
          {
            tag: "tfoot",
            display: "table-footer-group",
            rows: [2],
            styles: { "background-color": "rgb(240, 240, 240)" },
          },
        ],
        cells: [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col, text: "v" }))),
      }),
    )!;
    expect(s.bands.map((b) => [b.node.tag, slotOf(b)])).toEqual([
      ["tfoot", { rowStart: 3, rowSpan: 1, colStart: 1, colSpan: 3 }],
    ]);
  });

  test('`rowspan="0"` spans to the end of its row group', () => {
    const t = table({
      widths: [50, 50],
      heights: [20, 20, 20],
      groups: [
        { tag: "tbody", display: "table-row-group", rows: [0, 1] },
        { tag: "tfoot", display: "table-footer-group", rows: [2] },
      ],
      cells: [
        { row: 0, col: 0, rowSpan: 2, text: "a" },
        { row: 0, col: 1, text: "b" },
        { row: 1, col: 1, text: "c" },
        { row: 2, col: 0, text: "d" },
        { row: 2, col: 1, text: "e" },
      ],
    });
    all(t, "td")[0]!.attrs["rowspan"] = "0";
    expect(tableSlots(t)!.cells[0]!.rowSpan).toBe(2);
  });

  test("a hole (a short row) is admitted", () => {
    const s = tableSlots(
      table({
        widths: [50, 50],
        heights: [20, 20],
        cells: [
          { row: 0, col: 0, text: "a" },
          { row: 0, col: 1, text: "b" },
          { row: 1, col: 0, text: "c" },
        ],
      }),
    );
    expect(s?.cells.map(slotOf).at(-1)).toEqual({ rowStart: 2, colStart: 1, rowSpan: 1, colSpan: 1 });
  });
});

describe("table-layout: fixed columns (Chrome 155 probes)", () => {
  const cell = { ...padding(3), ...border(2) };
  const fixed = (spec: Partial<TableSpec> & Pick<TableSpec, "widths" | "cells">) =>
    tableSlots(table({ heights: [20], h: 4, v: 4, ...spec, styles: { "table-layout": "fixed", ...spec.styles } }))!;

  test("`<col>` 100px / 20% / auto win over a first-row cell width", () => {
    const s = fixed({
      widths: [100, 56.797, 127.203],
      cols: ["100px", "20%", "auto"],
      cells: [
        { row: 0, col: 0, text: "x" },
        { row: 0, col: 1, text: "y", width: "50px" },
        { row: 0, col: 2, text: "z" },
      ],
    });
    expect(s.fixed).toEqual([px(100), pct(0.2, 0), auto]);
  });

  test("content-box px + padding + border; % of the available width + padding + border; autos share the rest", () => {
    const s = fixed({
      widths: [60, 38, 91, 91],
      cells: [
        { row: 0, col: 0, width: "50px", styles: cell },
        { row: 0, col: 1, width: "10%", styles: cell },
        { row: 0, col: 2, styles: cell },
        { row: 0, col: 3, styles: cell },
      ],
    });
    expect(s.fixed).toEqual([px(60), pct(0.1, 10), auto, auto]);
  });

  test("the available width is the content box minus the spacing", () => {
    const s = fixed({
      widths: [60, 36, 164],
      inset: 12,
      cells: [
        { row: 0, col: 0, width: "50px", styles: cell },
        { row: 0, col: 1, width: "10%", styles: cell },
        { row: 0, col: 2, styles: cell },
      ],
    });
    expect(s.fixed).toEqual([px(60), pct(0.1, 10), auto]);
  });

  test("no auto column: the leftover is spread proportionally", () => {
    const s = fixed({
      widths: [132.922, 155.078],
      cells: [
        { row: 0, col: 0, width: "50px", styles: cell },
        { row: 0, col: 1, width: "60px", styles: cell },
      ],
    });
    expect(s.fixed).toEqual([px(60), px(70)]);
  });

  test("a spanning first-row cell with a width falls back to auto scaling (admitted, no `fixed`)", () => {
    const s = fixed({
      widths: [53, 53, 178],
      heights: [20, 20],
      cells: [
        { row: 0, col: 0, colSpan: 2, width: "100px" },
        { row: 0, col: 2 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
    });
    expect(s.fixedRequested).toBe(true);
    expect(s.fixed).toBeUndefined();
  });

  test("collapsed: half borders + padding", () => {
    const s = fixed({
      widths: [58, 240],
      h: 0,
      v: 0,
      inset: 1,
      collapse: true,
      cells: [
        { row: 0, col: 0, width: "50px", styles: { ...padding(3), ...border(1) } },
        { row: 0, col: 1, styles: { ...padding(3), ...border(1) } },
      ],
    });
    expect(s.fixed).toEqual([px(58), auto]);
  });

  test("overflow: autos get 0 and the table grows", () => {
    const s = fixed({
      widths: [210, 210, 0],
      cells: [
        { row: 0, col: 0, width: "200px", styles: cell },
        { row: 0, col: 1, width: "200px", styles: cell },
        { row: 0, col: 2, styles: cell },
      ],
    });
    expect(s.fixed).toEqual([px(210), px(210), auto]);
  });

  test("`width: auto` + fixed lays out with the auto algorithm: no `fixed`", () => {
    const s = fixed({
      widths: [60, 51.906],
      width: "auto",
      cells: [
        { row: 0, col: 0, width: "50px", styles: cell },
        { row: 0, col: 1, styles: cell },
      ],
    });
    expect([s.fixedRequested, s.fixed]).toEqual([false, undefined]);
  });

  test("collapsed border-box: px as is, a percentage still adds padding + border", () => {
    const own = { "box-sizing": "border-box", ...padding(3), ...border(1) };
    const s = fixed({
      widths: [50, 97.391, 150.609],
      h: 0,
      v: 0,
      inset: 1,
      collapse: true,
      cells: [
        { row: 0, col: 0, width: "50px", styles: own },
        { row: 0, col: 1, width: "30%", styles: own },
        { row: 0, col: 2, styles: own },
      ],
    });
    expect(s.fixed).toEqual([px(50), pct(0.3, 8), auto]);
  });
});

describe("solveTableColumns", () => {
  const cases: Array<[TableColumn[] | undefined, number | undefined, number, number[], number[]]> = [
    [[px(60), pct(0.1, 10), auto, auto], 300, 4, [0, 0, 0, 0], [60, 38, 91, 91]],
    [[px(60), pct(0.1, 10), auto], 276, 4, [0, 0, 0], [60, 36, 164]],
    [[px(60), px(70)], 300, 4, [0, 0], [132.923, 155.077]],
    [[px(58), auto], 298, 0, [0, 0], [58, 240]],
    [[px(210), px(210), auto], 300, 4, [0, 0, 0], [210, 210, 0]],
    [[px(50), pct(0.3, 8), auto], 298, 0, [0, 0, 0], [50, 97.4, 150.6]],
    [undefined, undefined, 3, [88.688, 93.641, 93.672], [88.688, 93.641, 93.672]],
    [undefined, 288.001, 3, [88.688, 93.641, 93.672], [88.688, 93.641, 93.672]],
    [undefined, 200, 3, [88.688, 93.641, 93.672], [88.688, 93.641, 93.672].map((w) => (w * 188) / 276.001)],
  ];
  for (const [i, [fixed, width, spacing, widths, expected]] of cases.entries())
    test(`case ${i}`, () => near(solveTableColumns(width, widths, spacing, fixed), expected));
});

describe("tableSlots keeps the measured-rows path", () => {
  test("(control) the unmodified two-cell table is admitted", () => expect(tableSlots(table(two))).toBeDefined());
  const rejects = (name: string, t: LayoutNode) => test(name, () => expect(tableSlots(t)).toBeUndefined());
  const edit = (f: (t: LayoutNode) => void) => {
    const t = table(two);
    f(t);
    return t;
  };

  rejects("direction: rtl", table({ ...two, styles: { direction: "rtl" } }));
  rejects("a row with visibility: collapse", table({ ...two, rowStyles: { 0: { visibility: "collapse" } } }));
  rejects(
    "a non-whitespace #text in a row",
    edit((t) => all(t, "tr")[0]!.children.push(text("loose", { x: 0, y: 0, w: 30, h: 20 }))),
  );
  rejects(
    "an absolute div in a row",
    edit((t) =>
      all(t, "tr")[0]!.children.push(
        box("div", { x: 0, y: 0, w: 10, h: 10 }, { display: "block", position: "absolute" }),
      ),
    ),
  );
  rejects(
    "a display: block div child of the table",
    edit((t) => t.children.push(box("div", { x: 0, y: 40, w: 10, h: 10 }, { display: "block" }))),
  );
  rejects(
    "a separated table whose row paints a background",
    table({ ...two, rowStyles: { 0: { "background-color": "rgb(255, 0, 0)" } } }),
  );
  rejects(
    "a cell 1 px off its column line",
    edit((t) => {
      all(t, "td")[1]!.bounds.x += 1;
    }),
  );
  rejects("a gap ≠ border-spacing", table({ ...two, styles: { "border-spacing": "5px" } }));
  rejects(
    "a caption child of a div{display:table}",
    edit((t) => {
      t.tag = "div";
      t.children.unshift(box("caption", { x: 0, y: 0, w: 206, h: 0 }, { display: "table-caption" }));
    }),
  );
  rejects("rule 3b: a tr with onclick", table({ ...two, rowAttrs: { 0: { onclick: "go()" } } }));
  rejects("rule 3b: a tr with role=button", table({ ...two, rowAttrs: { 0: { role: "button" } } }));
  rejects("rule 3b: a tr with tabindex", table({ ...two, rowAttrs: { 0: { tabindex: "0" } } }));
  rejects(
    "rule 3b: a tbody with aria-label",
    table({
      ...two,
      groups: [{ tag: "tbody", display: "table-row-group", rows: [0], attrs: { "aria-label": "Rows" } }],
    }),
  );
});

describe("MarkswiftTable emission", () => {
  const code = (t: LayoutNode, mode: "app" | "fidelity") => compileLayout(doc(t), { name: "T", mode }).code;

  test("app: shared columns, spans, cells fill their slot", () => {
    const app = code(separated(), "app");
    expect(app).toContain(
      "MarkswiftTable(widths: [88.688, 93.64, 93.672], heights: [26.0, 26.0], hSpacing: 3.0, vSpacing: 5.0) {",
    );
    expect(app).toContain(".markswiftGridCell(column: 1, row: 1, columnSpan: 2)");
    expect(app).toContain(".markswiftGridCell(column: 3, row: 1, rowSpan: 2)");
    expect(app).toContain(".frame(maxWidth: .infinity, maxHeight: .infinity");
    expect(app).not.toContain(".frame(width: 185.33");
  });

  test("fidelity: the same Layout with the captured cell frames, never `fixed:`", () => {
    const fidelity = code(separated(), "fidelity");
    expect(fidelity).toContain(
      "MarkswiftTable(widths: [88.688, 93.64, 93.672], heights: [26.0, 26.0], hSpacing: 3.0, vSpacing: 5.0) {",
    );
    expect(fidelity).toContain(".frame(width: 185.33, height: 26.0");
    expect(fidelity).not.toContain("fixed:");
  });

  test("a collapsed table's painted tfoot: `bands: 1`, the band before the first cell", () => {
    const t = table({
      widths: [100, 100],
      heights: [30, 30],
      collapse: true,
      groups: [
        { tag: "tbody", display: "table-row-group", rows: [0] },
        {
          tag: "tfoot",
          display: "table-footer-group",
          rows: [1],
          styles: { "background-color": "rgb(240, 240, 240)" },
        },
      ],
      cells: [
        { row: 0, col: 0, text: "a" },
        { row: 0, col: 1, text: "b" },
        { row: 1, col: 0, colSpan: 2, text: "sum" },
      ],
    });
    const app = code(t, "app");
    expect(app).toContain("bands: 1) {");
    const band = app.indexOf(".markswiftGridCell(column: 1, row: 2, columnSpan: 2)");
    expect(band).toBeGreaterThan(-1);
    expect(band).toBeLessThan(app.indexOf(".markswiftGridCell(column: 1, row: 1)"));
  });

  test("app: admitted fixed columns", () => {
    const t = table({
      widths: [100, 56.797, 127.203],
      heights: [20],
      h: 4,
      v: 4,
      cols: ["100px", "20%", "auto"],
      styles: { "table-layout": "fixed" },
      cells: [0, 1, 2].map((col) => ({ row: 0, col, text: "x" })),
    });
    expect(code(t, "app")).toContain("fixed: [.px(100.0), .percent(0.2, plus: 0.0), .auto]");
    expect(code(t, "fidelity")).not.toContain("fixed:");
  });
});
