/**
 * Admission of a captured CSS table into `MarkswiftTable`: its HTML-table-model slot grid, checked against
 * the captured boxes, and the `table-layout: fixed` column solver the runtime mirrors.
 */
import type { LayoutNode } from "../model/layout.ts";
import type { GridPlacement, TableColumn } from "../model/semantic.ts";
import { parseColor, px } from "../css/index.ts";
import { EDGES, edgeWidth, insetsOf, outOfFlow, renders } from "./geometry.ts";

type Slot = Pick<GridPlacement, "rowStart" | "colStart" | "rowSpan" | "colSpan">;

/** One slot-grid member of a captured table: its LayoutNode, its row (and row group), 1-based slot. */
export interface TableMember extends Slot {
  node: LayoutNode;
  parent: LayoutNode;
  group?: LayoutNode;
}
export interface TableSlots {
  widths: number[];
  heights: number[];
  hSpacing: number;
  vSpacing: number;
  collapse: boolean;
  /** `table-layout: fixed` on a table with a non-`auto` Typed-OM width (CSS applies the fixed algorithm). */
  fixedRequested: boolean;
  /** The table's Typed-OM width is `<n>px` (read from `t`): the offered width is the captured one, scaling is exact. */
  widthFixed: boolean;
  fixed?: TableColumn[];
  /** Painting row groups then rows (collapsed tables only), each spanning every column. */
  bands: Array<Slot & { node: LayoutNode }>;
  /** Cells in DOM row-major order. */
  cells: TableMember[];
}

/** Column widths for a content width; mirrors MarkswiftTable.columns (runtime/table.swift). */
export function solveTableColumns(
  width: number | undefined,
  widths: number[],
  spacing: number,
  fixed?: TableColumn[],
): number[] {
  const gaps = (widths.length + 1) * spacing;
  const natural = widths.reduce((a, b) => a + b, 0);
  const avail = Math.max(0, (width ?? natural + gaps) - gaps);
  if (!fixed) return widths.map((w) => (natural > 0 ? (w * avail) / natural : avail / Math.max(1, widths.length)));
  const base = fixed.map((c) => (c.kind === "px" ? c.px : c.kind === "percent" ? c.fraction * avail + c.plus : 0));
  const autos = fixed.filter((c) => c.kind === "auto").length;
  const left = avail - base.reduce((a, b) => a + b, 0);
  if (autos) return fixed.map((c, i) => (c.kind === "auto" ? Math.max(0, left / autos) : base[i]!));
  const sum = base.reduce((a, b) => a + b, 0);
  return left > 0 && sum > 0 ? base.map((w) => w + (left * w) / sum) : base;
}
// ponytail: auto tables scale the captured columns; CSS auto layout re-solves min/max-content per width.
// Measure each column's min/max-content (sizeThatFits at 0 / nil) in the runtime if reflowed tables diverge.

const GROUP = /^table-(row|header|footer)-group$/;
const COLUMN = /^table-column(-group)?$/;
const TOL = 0.5;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const blank = (n: LayoutNode) => n.tag === "#text" && /^[ \t\n\r\f]*$/.test(n.text ?? "");
/** A row or row group with its own action or accessibility (rule 3b): only the measured-rows path keeps it. */
const ownSemantics = (n: LayoutNode) =>
  Object.keys(n.attrs).some((k) => k === "role" || k === "tabindex" || k === "onclick" || k.startsWith("aria-"));
const paints = (s: Record<string, string>) =>
  (parseColor(s["background-color"])?.a ?? 0) > 0 ||
  (s["background-image"] ?? "none") !== "none" ||
  EDGES.some((e) => edgeWidth(s, e) > 0) ||
  (s["box-shadow"] ?? "none") !== "none";

/** The table's slot grid when every captured box sits on it (0.5 px); undefined keeps the measured-rows path. */
export function tableSlots(t: LayoutNode): TableSlots | undefined {
  // 1. A horizontal, left-to-right table.
  if (!/^(inline-)?table$/.test(t.styles["display"] ?? "")) return undefined;
  if (t.styles["direction"] === "rtl") return undefined;
  if ((t.styles["writing-mode"] ?? "horizontal-tb") !== "horizontal-tb") return undefined;

  // 2. Only a caption, columns, row groups and rows.
  /** A row group (or one direct row) and, once ordered, the 0-based index of its first row. */
  const sections: Array<{ group?: LayoutNode; rows: LayoutNode[]; start: number }> = [];
  const columns: LayoutNode[] = [];
  for (const c of t.children) {
    if (blank(c) || !renders(c)) continue;
    if (c.tag === "#text" || outOfFlow(c)) return undefined;
    const d = c.styles["display"] ?? "";
    const edge = c === t.children[0] || c === t.children[t.children.length - 1];
    if (c.tag === "caption" && t.tag === "table" && edge) continue;
    if (COLUMN.test(d)) columns.push(c);
    else if (GROUP.test(d)) sections.push({ group: c, rows: [], start: 0 });
    else if (d === "table-row") sections.push({ rows: [c], start: 0 });
    else return undefined;
  }

  // 3. Groups hold rendered rows; rows hold rendered, in-flow cells. 3b: rows and groups carry no semantics.
  const collapsed = (n: LayoutNode) => n.styles["visibility"] === "collapse";
  for (const s of sections) {
    if (s.group) {
      if (collapsed(s.group) || ownSemantics(s.group)) return undefined;
      for (const r of s.group.children) {
        if (blank(r) || !renders(r)) continue;
        if (r.styles["display"] !== "table-row" || r.tag === "#text" || outOfFlow(r)) return undefined;
        s.rows.push(r);
      }
    }
    for (const r of s.rows) if (collapsed(r) || ownSemantics(r)) return undefined;
  }
  const cellsOf = new Map<LayoutNode, LayoutNode[]>();
  for (const s of sections)
    for (const r of s.rows) {
      const cells: LayoutNode[] = [];
      for (const c of r.children) {
        if (blank(c) || !renders(c)) continue;
        if (c.tag === "#text" || outOfFlow(c) || c.styles["display"] !== "table-cell" || collapsed(c)) return undefined;
        cells.push(c);
      }
      cellsOf.set(r, cells);
    }

  // 4. Rows in visual order; HTML table model slots.
  const ordered = sections
    .filter((s) => s.rows.length)
    .sort((a, b) => (a.group ?? a.rows[0]!).bounds.y - (b.group ?? b.rows[0]!).bounds.y);
  const rows = ordered.flatMap((s) => s.rows);
  if (!rows.length || ![...cellsOf.values()].some((c) => c.length)) return undefined;
  const taken = new Set<string>();
  const cells: TableMember[] = [];
  let first = 0;
  for (const s of ordered) {
    s.start = first;
    const end = s.group ? first + s.rows.length : rows.length;
    for (const [i, row] of s.rows.entries()) {
      const r = first + i;
      let col = 1;
      for (const node of cellsOf.get(row)!) {
        while (taken.has(`${r},${col}`)) col++;
        const colSpan = Math.min(1000, Math.max(1, parseInt(node.attrs["colspan"] ?? "", 10) || 1));
        const raw = parseInt(node.attrs["rowspan"] ?? "", 10);
        const rowSpan = raw === 0 ? end - r : Math.min(end - r, Number.isNaN(raw) || raw < 0 ? 1 : raw);
        for (let y = r; y < r + rowSpan; y++) for (let x = col; x < col + colSpan; x++) taken.add(`${y},${x}`);
        cells.push({
          node,
          parent: row,
          ...(s.group ? { group: s.group } : {}),
          rowStart: r + 1,
          colStart: col,
          rowSpan,
          colSpan,
        });
        col += colSpan;
      }
    }
    first += s.rows.length;
  }
  const count = Math.max(...cells.map((c) => c.colStart + c.colSpan - 1));

  // 5. Spacing and collapse.
  const collapse = t.styles["border-collapse"] === "collapse";
  const spacing = (t.styles["border-spacing"] ?? "").trim().split(/\s+/);
  const [hSpacing, vSpacing] = collapse ? [0, 0] : [px(spacing[0]), px(spacing[1] ?? spacing[0])];
  const widthFixed = /px$/.test(t.preferredSize?.width ?? "");

  // 6. Every cell on the column and row lines; gaps are the spacing.
  const colLeft: number[] = [];
  const colRight: number[] = [];
  for (const c of cells) {
    colLeft[c.colStart - 1] ??= c.node.bounds.x;
    colRight[c.colStart + c.colSpan - 2] ??= c.node.bounds.x + c.node.bounds.w;
  }
  for (let c = 0; c < count; c++) if (colLeft[c] === undefined || colRight[c] === undefined) return undefined;
  const rowTop = rows.map((r) => r.bounds.y);
  const rowBottom = rows.map((r) => r.bounds.y + r.bounds.h);
  for (const c of cells) {
    const b = c.node.bounds;
    if (!near(b.x, colLeft[c.colStart - 1]!) || !near(b.x + b.w, colRight[c.colStart + c.colSpan - 2]!))
      return undefined;
    if (!near(b.y, rowTop[c.rowStart - 1]!) || !near(b.y + b.h, rowBottom[c.rowStart + c.rowSpan - 2]!))
      return undefined;
  }
  for (let c = 1; c < count; c++) if (!near(colLeft[c]! - colRight[c - 1]!, hSpacing)) return undefined;
  for (let r = 1; r < rows.length; r++) if (!near(rowTop[r]! - rowBottom[r - 1]!, vSpacing)) return undefined;
  const insets = insetsOf(t.styles);
  if (!near(colLeft[0]! - (t.bounds.x + insets[3]), hSpacing)) return undefined;
  if (!near(t.bounds.x + t.bounds.w - insets[1] - colRight[count - 1]!, hSpacing)) return undefined;
  const widths = colLeft.map((l, c) => colRight[c]! - l);
  const heights = rowTop.map((y, r) => rowBottom[r]! - y);

  // 7. Row-group and row paint: bands in a collapsed table; a separated table paints it per cell (not admitted).
  const bands: TableSlots["bands"] = [];
  for (const s of ordered)
    if (s.group && paints(s.group.styles))
      bands.push({ node: s.group, rowStart: s.start + 1, rowSpan: s.rows.length, colStart: 1, colSpan: count });
  for (const [r, row] of rows.entries())
    if (paints(row.styles)) bands.push({ node: row, rowStart: r + 1, rowSpan: 1, colStart: 1, colSpan: count });
  if (bands.length && !collapse) return undefined;

  // 8. `table-layout: fixed` columns, kept only when the solver reproduces the captured ones.
  const fixedRequested = t.styles["table-layout"] === "fixed" && (t.preferredSize?.width ?? "auto") !== "auto";
  const fixed = fixedRequested ? fixedColumns(columns, cells, count) : undefined;
  const natural = widths.reduce((a, b) => a + b, 0) + (count + 1) * hSpacing;
  const kept =
    fixed && solveTableColumns(natural, widths, hSpacing, fixed).every((w, c) => near(w, widths[c]!))
      ? fixed
      : undefined;

  return {
    widths,
    heights,
    hSpacing,
    vSpacing,
    collapse,
    fixedRequested,
    widthFixed,
    ...(kept ? { fixed: kept } : {}),
    bands,
    cells,
  };
}

/**
 * A Typed-OM width as a fixed column: px is the border-box (content-box px + `extra`, the cell's horizontal padding
 * and border); a percentage always adds `extra` (Chrome 155, also under `box-sizing: border-box`). `undefined`:
 * `auto`; `null`: a value the solver does not model.
 */
function lengthColumn(width: string, extra: number, borderBox: boolean): TableColumn | null | undefined {
  const m = /^(-?[\d.]+)(px|%)$/.exec(width);
  if (!m) return width === "auto" ? undefined : null;
  return m[2] === "px"
    ? { kind: "px", px: Number(m[1]) + (borderBox ? 0 : extra) }
    : { kind: "percent", fraction: Number(m[1]) / 100, plus: extra };
}

/** Columns from `<col>` widths, else the first row's cells; undefined when the fixed algorithm is not reproduced. */
function fixedColumns(columns: LayoutNode[], cells: TableMember[], count: number): TableColumn[] | undefined {
  const fromCols: Array<TableColumn | undefined> = [];
  for (const g of columns) {
    const cols = g.children.filter((c) => renders(c) && c.styles["display"] === "table-column");
    if (g.styles["display"] === "table-column-group" && cols.length) {
      if ((g.preferredSize?.width ?? "auto") !== "auto") return undefined;
    } else cols.push(g);
    for (const col of cols) {
      const span = parseInt(col.attrs["span"] ?? "", 10) || 1;
      const c = lengthColumn(col.preferredSize?.width ?? "auto", 0, false) ?? undefined;
      for (let i = 0; i < span; i++) fromCols.push(c);
    }
  }
  const out: TableColumn[] = [];
  for (let c = 1; c <= count; c++) {
    const col = fromCols[c - 1];
    if (col) {
      out.push(col);
      continue;
    }
    const cell = cells.find((m) => m.rowStart === 1 && m.colStart === c);
    const width = cell?.node.preferredSize?.width ?? "auto";
    if (!cell || width === "auto") {
      out.push({ kind: "auto" });
      continue;
    }
    if (cell.colSpan > 1) return undefined;
    const s = cell.node.styles;
    const extra = px(s["padding-left"]) + px(s["padding-right"]) + edgeWidth(s, "left") + edgeWidth(s, "right");
    const column = lengthColumn(width, extra, s["box-sizing"] === "border-box");
    if (!column) return undefined;
    out.push(column);
  }
  return out;
}
