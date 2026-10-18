/** Hand-built captured tables: boxes on a column/row lattice, as Chrome lays a CSS table out. */
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Rect } from "../../src/model/layout.ts";

const TEXT = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

export function box(
  tag: string,
  bounds: Rect,
  styles: Record<string, string> = {},
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
  width?: string,
): LayoutNode {
  return {
    tag,
    attrs,
    styles: { ...TEXT, ...styles },
    bounds,
    children,
    ...(width ? { preferredSize: { width, height: "auto" } } : {}),
  };
}

export function text(s: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...TEXT }, bounds, text: s, children: [] };
}

/** `border-<side>-{style,width,color}` on every side. */
export function border(width: number, color = "rgb(136, 136, 136)"): Record<string, string> {
  return Object.fromEntries(
    ["top", "right", "bottom", "left"].flatMap((e) => [
      [`border-${e}-style`, "solid"],
      [`border-${e}-width`, `${width}px`],
      [`border-${e}-color`, color],
    ]),
  );
}

export function padding(px: number): Record<string, string> {
  return Object.fromEntries(["top", "right", "bottom", "left"].map((e) => [`padding-${e}`, `${px}px`]));
}

export interface CellSpec {
  /** 0-based slot. */
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  tag?: string;
  text?: string;
  /** Typed-OM width (`preferredSize.width`). */
  width?: string;
  styles?: Record<string, string>;
  attrs?: Record<string, string>;
}

export interface TableSpec {
  /** Column border-box widths and row heights. */
  widths: number[];
  heights: number[];
  h?: number;
  v?: number;
  /** Table padding + border per side (written as padding unless `styles` says otherwise). */
  inset?: number;
  collapse?: boolean;
  /** Table Typed-OM width. */
  width?: string;
  caption?: number;
  styles?: Record<string, string>;
  cells: CellSpec[];
  /** Row groups (default: one `tbody` of every row). */
  groups?: Array<{
    tag: string;
    display: string;
    rows: number[];
    styles?: Record<string, string>;
    attrs?: Record<string, string>;
  }>;
  rowStyles?: Record<number, Record<string, string>>;
  rowAttrs?: Record<number, Record<string, string>>;
  /** `<col>` Typed-OM widths in one `colgroup`. */
  cols?: string[];
}

/** A table whose boxes sit exactly on the lattice its spec describes. */
export function table(o: TableSpec): LayoutNode {
  const h = o.h ?? 0,
    v = o.v ?? 0,
    inset = o.inset ?? 0,
    top = o.caption ?? 0;
  const colX = (c: number) => inset + h + o.widths.slice(0, c).reduce((a, b) => a + b + h, 0);
  const rowY = (r: number) => top + inset + v + o.heights.slice(0, r).reduce((a, b) => a + b + v, 0);
  const span = (sizes: number[], first: number, n: number, gap: number) =>
    sizes.slice(first, first + n).reduce((a, b) => a + b, 0) + (n - 1) * gap;
  const gridW = span(o.widths, 0, o.widths.length, h);
  const rowNode = (r: number) =>
    box(
      "tr",
      { x: colX(0), y: rowY(r), w: gridW, h: o.heights[r]! },
      { display: "table-row", ...o.rowStyles?.[r] },
      o.cells
        .filter((c) => c.row === r)
        .map((c) => {
          const b = {
            x: colX(c.col),
            y: rowY(r),
            w: span(o.widths, c.col, c.colSpan ?? 1, h),
            h: span(o.heights, r, c.rowSpan ?? 1, v),
          };
          return box(
            c.tag ?? "td",
            b,
            { display: "table-cell", ...c.styles },
            c.text ? [text(c.text, { x: b.x + 2, y: b.y + 2, w: 8 * c.text.length, h: 20 })] : [],
            {
              ...(c.colSpan && c.colSpan > 1 ? { colspan: String(c.colSpan) } : {}),
              ...(c.rowSpan && c.rowSpan > 1 ? { rowspan: String(c.rowSpan) } : {}),
              ...c.attrs,
            },
            c.width,
          );
        }),
      o.rowAttrs?.[r] ?? {},
    );
  const groups = o.groups ?? [{ tag: "tbody", display: "table-row-group", rows: o.heights.map((_, r) => r) }];
  const children: LayoutNode[] = [];
  if (o.caption)
    children.push(
      box("caption", { x: 0, y: 0, w: 2 * inset + gridW + 2 * h, h: top }, { display: "table-caption" }, [
        text("Cap", { x: 0, y: 0, w: 24, h: 20 }),
      ]),
    );
  if (o.cols)
    children.push(
      box(
        "colgroup",
        { x: 0, y: 0, w: 0, h: 0 },
        { display: "table-column-group" },
        o.cols.map((w) => box("col", { x: 0, y: 0, w: 0, h: 0 }, { display: "table-column" }, [], {}, w)),
        {},
        "auto",
      ),
    );
  for (const g of groups) {
    const rows = g.rows.map(rowNode);
    const first = rows[0]!.bounds,
      last = rows[rows.length - 1]!.bounds;
    children.push(
      box(
        g.tag,
        { x: first.x, y: first.y, w: gridW, h: last.y + last.h - first.y },
        { display: g.display, ...g.styles },
        rows,
        g.attrs ?? {},
      ),
    );
  }
  const height = top + 2 * inset + span(o.heights, 0, o.heights.length, v) + 2 * v;
  return box(
    "table",
    { x: 0, y: 0, w: 2 * inset + gridW + 2 * h, h: height },
    {
      display: "table",
      "border-collapse": o.collapse ? "collapse" : "separate",
      "border-spacing": o.collapse ? "0px" : h === v ? `${h}px` : `${h}px ${v}px`,
      ...padding(inset),
      ...o.styles,
    },
    children,
    {},
    o.width ?? "300px",
  );
}

export function doc(root: LayoutNode): LayoutDoc {
  const w = root.bounds.w,
    h = root.bounds.h;
  return {
    version: LAYOUT_DOC_VERSION,
    source: "table.html",
    combo: { screen: "s", theme: "light" },
    size: { w, h },
    viewport: { x: 0, y: 0, w, h },
    conditions: [],
    dpr: 3,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: box("main", { x: 0, y: 0, w, h }, { display: "block" }, [root], {}, `${w}px`),
  };
}

/**
 * Chrome 155's separated probe: caption, `border-spacing: 3px 5px`, border 2 + padding 4, a colspan and a
 * rowspan. Chrome's columns are 88.688 / 93.641 / 93.672 at a 300px table; the middle one is rounded so they sum to 276.
 */
export function separated(): LayoutNode {
  return table({
    widths: [88.688, 93.64, 93.672],
    heights: [26, 26],
    h: 3,
    v: 5,
    inset: 6,
    caption: 20,
    styles: { ...padding(4), ...border(2, "rgb(0, 0, 0)") },
    cells: [
      { row: 0, col: 0, colSpan: 2, text: "a" },
      { row: 0, col: 2, rowSpan: 2, text: "b" },
      { row: 1, col: 0, text: "c" },
      { row: 1, col: 1, text: "d" },
    ],
  });
}

/** A collapsed `width: 100%` table: a header row of two `<th>` over one body row. */
export function collapsed(): LayoutNode {
  return table({
    widths: [100, 100],
    heights: [30, 30],
    collapse: true,
    width: "100%",
    groups: [
      { tag: "thead", display: "table-header-group", rows: [0] },
      { tag: "tbody", display: "table-row-group", rows: [1] },
    ],
    cells: [
      { row: 0, col: 0, tag: "th", text: "Region" },
      { row: 0, col: 1, tag: "th", text: "Rep" },
      { row: 1, col: 0, text: "North" },
      { row: 1, col: 1, text: "Ada" },
    ],
  });
}
