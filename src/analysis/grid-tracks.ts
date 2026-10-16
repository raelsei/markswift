/** Authored grid tracks the runtime `MarkswiftTracks` reproduces, admitted only when they reproduce the capture. */
import type { LayoutNode } from "../model/layout.ts";
import type { GridPlacement, GridRowTrack, GridTemplate } from "../model/semantic.ts";
import { gridSpan, parseGridAreas, parseRowTracks, parseTrackTemplate, px, resolvedGridTracks } from "../css/index.ts";
import { insetsOf, outOfFlow } from "./geometry.ts";

/**
 * Column widths for a content width, mirroring MarkswiftTracks.columns (runtime/tracks.swift). fr tracks follow CSS's
 * "find the size of an fr": an fr sum below 1 leaves space unused, and a track whose `minmax(<px>, fr)` floor exceeds
 * its share freezes at the floor while the rest share again.
 */
export function solveTracks(
  t: GridTemplate,
  width: number,
  gap: number,
  count: number,
  autoWidths: number[],
): number[] {
  if (t.autoRepeat) {
    let n = Math.max(1, Math.floor((width + gap) / (t.autoRepeat.min + gap)));
    if (t.autoRepeat.mode === "fit") n = Math.min(n, Math.max(1, count)); // auto-fit collapses empty tracks
    return Array(n).fill(Math.max(0, (width - (n - 1) * gap) / n));
  }
  const sizes = t.tracks.map((k, c) =>
    k.kind === "px" ? k.px : k.kind === "auto" ? (autoWidths[c] ?? 0) : (k.min ?? 0),
  );
  const open = t.tracks.map((k) => k.kind === "fr");
  for (let changed = true; changed; ) {
    changed = false;
    const free = width - (t.tracks.length - 1) * gap - sizes.reduce((sum, s, c) => sum + (open[c] ? 0 : s), 0);
    const frs = t.tracks.reduce((sum, k, c) => sum + (open[c] && k.kind === "fr" ? k.fr : 0), 0);
    const unit = Math.max(0, free) / Math.max(1, frs);
    for (const [c, k] of t.tracks.entries()) {
      if (!open[c] || k.kind !== "fr") continue;
      if (unit * k.fr < (k.min ?? 0)) {
        open[c] = false;
        sizes[c] = k.min!;
        changed = true;
      } else sizes[c] = unit * k.fr;
    }
  }
  return sizes;
}
// ponytail: a bare fr track is minmax(0, fr); CSS 1fr is minmax(auto, 1fr) and never shrinks below min-content.
// Admission proves the captured width only; measure min-content in the runtime if narrow widths diverge.

const near = (a: number, b: number) => Math.abs(a - b) <= 1;
const START: Record<string, true> = { normal: true, stretch: true, start: true, "flex-start": true };
const START_CONTENT: Record<string, true> = { normal: true, stretch: true };

/** Every `#text` under `n` sits on one line, so its captured width is its max-content width. */
function singleLine(n: LayoutNode): boolean {
  return n.tag === "#text" ? (n.lines?.length ?? 0) <= 1 : n.children.every(singleLine);
}

/**
 * Row heights, mirroring MarkswiftTracks.rowHeights (runtime/tracks.swift). CSS grid §12.5 for heights (an item's min-
 * and max-content heights are equal): a spanning item's missing height goes equally to its spanned auto rows that no
 * item has sized yet, else equally to all its spanned auto rows; same-span items take the max per row, smaller first.
 */
export function solveRows(
  rows: GridRowTrack[],
  autoRow: GridRowTrack,
  gap: number,
  items: Array<{ row: number; span: number; height: number }>,
): number[] {
  const count = Math.max(rows.length, ...items.map((i) => i.row + i.span - 1));
  const defs = Array.from({ length: count }, (_, r) => rows[r] ?? autoRow);
  const sizes = defs.map((d) => (d.kind === "px" ? d.px : 0));
  const open = defs.map((d) => d.kind === "auto");
  for (const i of items)
    if (i.span === 1 && defs[i.row - 1]!.kind === "auto") {
      sizes[i.row - 1] = Math.max(sizes[i.row - 1]!, i.height);
      open[i.row - 1] = false;
    }
  for (const span of [...new Set(items.map((i) => i.span).filter((s) => s > 1))].sort((a, b) => a - b)) {
    const planned = sizes.map(() => 0);
    for (const i of items.filter((i) => i.span === span)) {
      const range = Array.from({ length: span }, (_, k) => i.row - 1 + k);
      const extra = i.height - range.reduce((s, r) => s + sizes[r]!, 0) - (span - 1) * gap;
      const auto = range.filter((r) => defs[r]!.kind === "auto");
      const targets = auto.some((r) => open[r]) ? auto.filter((r) => open[r]) : auto;
      if (extra > 0) for (const r of targets) planned[r] = Math.max(planned[r]!, extra / targets.length);
    }
    for (const [r, p] of planned.entries())
      if (p > 0) {
        sizes[r]! += p;
        open[r] = false;
      }
  }
  return sizes;
}

type Span = { start?: number; span: number };
/**
 * CSS grid §8.5 auto-placement, `grid-auto-flow: row` (sparse), in a grid of `k` explicit columns: items with both
 * lines first, then items locked to a row, then the rest behind a cursor. Each item's 1-based [column, row] start, or
 * undefined when an item needs an implicit column or two items with both lines overlap.
 */
export function placeItems(k: number, items: Array<{ col: Span; row: Span }>): Array<[number, number]> | undefined {
  const at: Array<[number, number] | undefined> = items.map(() => undefined);
  const taken = (c: number, r: number, i: number) =>
    at.some(
      (p, j) =>
        p &&
        c < p[0] + items[j]!.col.span &&
        p[0] < c + items[i]!.col.span &&
        r < p[1] + items[j]!.row.span &&
        p[1] < r + items[i]!.row.span,
    );
  if (items.some((it) => (it.col.start ?? 1) + it.col.span - 1 > k)) return undefined;
  for (const [i, it] of items.entries())
    if (it.col.start && it.row.start) {
      if (taken(it.col.start, it.row.start, i)) return undefined;
      at[i] = [it.col.start, it.row.start];
    }
  const rowCursor: Record<number, number> = {};
  for (const [i, it] of items.entries())
    if (!it.col.start && it.row.start) {
      let c = rowCursor[it.row.start] ?? 1;
      while (c + it.col.span - 1 <= k && taken(c, it.row.start, i)) c++;
      if (c + it.col.span - 1 > k) return undefined;
      at[i] = [c, it.row.start];
      rowCursor[it.row.start] = c + it.col.span;
    }
  let row = 1,
    col = 1;
  for (const [i, it] of items.entries()) {
    if (it.row.start) continue;
    if (it.col.start) {
      if (it.col.start < col) row++;
      col = it.col.start;
      while (taken(col, row, i)) row++;
    } else
      for (;;) {
        if (col + it.col.span - 1 > k) {
          row++;
          col = 1;
        } else if (taken(col, row, i)) col++;
        else break;
      }
    at[i] = [col, row];
  }
  return at as Array<[number, number]>;
}

const JUSTIFY: Record<string, GridPlacement["justify"]> = {
  normal: "stretch",
  stretch: "stretch",
  start: "start",
  "flex-start": "start",
  "self-start": "start",
  left: "start",
  end: "end",
  "flex-end": "end",
  "self-end": "end",
  right: "end",
  center: "center",
};

/**
 * The authored template, rows and every item's placement when the solvers reproduce every captured cell within 1px;
 * else undefined.
 */
// ponytail: items spanning an `auto` column are not admitted; CSS distributes span contributions over intrinsic
// columns (§12.5). Mirror the column distribution like `solveRows` if such grids matter.
// ponytail: auto-placement is resolved at capture, so auto-fill/auto-fit grids admit only row-major auto-placement.
export function admitTracks(n: LayoutNode):
  | {
      template: GridTemplate;
      stretch: boolean;
      rows?: GridRowTrack[];
      autoRow?: GridRowTrack;
      placements: GridPlacement[];
    }
  | undefined {
  const s = n.styles;
  if (s.display !== "grid" && s.display !== "inline-grid") return undefined;
  if (s.direction === "rtl" || (s["grid-auto-flow"] ?? "row") !== "row") return undefined;
  // One implicit `auto` column stretched by `justify-content: normal` is `1fr` at every width ≥ its content.
  const implicit =
    n.preferredSize?.gridTemplateColumns === undefined &&
    s["grid-auto-columns"] === "auto" &&
    resolvedGridTracks(s["grid-template-columns"])?.length === 1 &&
    START_CONTENT[s["justify-content"] ?? "normal"] === true;
  const template: GridTemplate | undefined = implicit
    ? { tracks: [{ kind: "fr", fr: 1 }] }
    : parseTrackTemplate(n.preferredSize?.gridTemplateColumns);
  if (!template || (!template.autoRepeat && template.tracks.every((t) => t.kind === "px"))) return undefined;
  const authoredRows = n.preferredSize?.gridTemplateRows;
  const explicit = authoredRows === undefined ? [] : parseRowTracks(authoredRows);
  const autoRow = parseRowTracks(s["grid-auto-rows"] ?? "auto");
  const grid = parseGridAreas(s["grid-template-areas"] ?? "none");
  if (!explicit || !grid || autoRow?.length !== 1 || grid.columns > template.tracks.length) return undefined;
  if (template.autoRepeat && Object.keys(grid.areas).length) return undefined;
  const items = n.children.filter((c) => c.tag !== "#text" && c.styles.display !== "none" && !outOfFlow(c));
  if (!items.length || n.children.some((c) => c.tag === "#text" && (c.text ?? "").trim())) return undefined;
  if (items.some((item) => (item.styles.order ?? "0") !== "0")) return undefined;
  const alignItems = s["align-items"] ?? "normal";
  if (!START[alignItems]) return undefined;
  for (const item of items) {
    const self = item.styles["align-self"] ?? "auto";
    if (self !== "auto" && self !== "normal" && self !== alignItems) return undefined;
  }
  const fixed: boolean[] = [];
  for (const item of items) {
    if (px(item.styles["margin-left"]) !== 0 || px(item.styles["margin-right"]) !== 0) return undefined;
    const width = item.preferredSize?.width ?? "auto";
    const height = item.preferredSize?.height ?? "auto";
    fixed.push(/px$/.test(width) && /px$/.test(height));
    if (!fixed.at(-1) && (height !== "auto" || /px$/.test(width))) return undefined;
  }
  const firstXs: number[] = [];
  const rowTop = (item: LayoutNode) => item.bounds.y - px(item.styles["margin-top"]);
  for (const item of items)
    if (near(rowTop(item), rowTop(items[0]!)) && !firstXs.some((x) => near(x, item.bounds.x)))
      firstXs.push(item.bounds.x);
  const k = template.autoRepeat ? firstXs.length : template.tracks.length;
  const rowLines = Math.max(explicit.length, grid.rows) + 1;
  const spans = items.map((item) => {
    const st = item.styles;
    const col = gridSpan(st["grid-column-start"], st["grid-column-end"], grid.areas, "col", k + 1);
    const row = gridSpan(st["grid-row-start"], st["grid-row-end"], grid.areas, "row", rowLines);
    return col && row ? { col, row } : undefined;
  });
  if (spans.some((sp) => !sp)) return undefined;
  const auto = (sp: Span) => sp.start === undefined && sp.span === 1;
  if (template.autoRepeat && !spans.every((sp) => auto(sp!.col) && auto(sp!.row))) return undefined;
  const at = template.autoRepeat
    ? items.map((_, i): [number, number] => [(i % k) + 1, Math.floor(i / k) + 1])
    : placeItems(k, spans as Array<{ col: Span; row: Span }>);
  if (!at) return undefined;
  const justifyItems = (s["justify-items"] ?? "normal").replace(/^legacy(?: |$)/, "") || "normal";
  const placements: GridPlacement[] = [];
  for (const [i, item] of items.entries()) {
    const js = item.styles["justify-self"] ?? "auto";
    const justify = JUSTIFY[js === "auto" ? justifyItems : js];
    if (!justify || (template.autoRepeat && justify !== "stretch")) return undefined;
    const sp = spans[i]!;
    placements.push({
      fixed: fixed[i]!,
      colStart: at[i]![0],
      colSpan: sp.col.span,
      rowStart: at[i]![1],
      rowSpan: sp.row.span,
      justify,
    });
  }
  // Content-sized widths must be provable: an item in an `auto` column or narrower than its span is single-line.
  const autoWidths: number[] = [];
  for (const [i, item] of items.entries()) {
    const p = placements[i]!;
    const spanned = template.tracks.slice(p.colStart - 1, p.colStart - 1 + p.colSpan);
    const inAuto = spanned.some((t) => t.kind === "auto");
    if (inAuto && p.colSpan > 1) return undefined;
    if ((inAuto || p.justify !== "stretch") && !/px$/.test(item.preferredSize?.width ?? "") && !singleLine(item))
      return undefined;
    if (inAuto) autoWidths[p.colStart - 1] = Math.max(autoWidths[p.colStart - 1] ?? 0, item.bounds.w);
  }
  const insets = insetsOf(s);
  const x0 = n.bounds.x + insets[3];
  const W = n.bounds.w - insets[1] - insets[3];
  const gap = px(s["column-gap"]);
  const cols = solveTracks(template, W, gap, items.length, autoWidths);
  if (cols.length !== k) return undefined;
  const extent = (sizes: number[], start: number, count: number, g: number) =>
    sizes.slice(start, start + count).reduce((sum, w) => sum + w, 0) + Math.max(0, count - 1) * g;
  for (const [i, item] of items.entries()) {
    const p = placements[i]!;
    const spanW = extent(cols, p.colStart - 1, p.colSpan, gap);
    const stretched = p.justify === "stretch" && !p.fixed;
    const w = stretched ? spanW : item.bounds.w;
    const offset = p.justify === "end" ? spanW - w : p.justify === "center" ? (spanW - w) / 2 : 0;
    const x = x0 + extent(cols, 0, p.colStart - 1, gap) + (p.colStart > 1 ? gap : 0) + offset;
    if (!near(item.bounds.x, x)) return undefined;
    if (stretched ? !near(item.bounds.w, w) : item.bounds.w > spanW + 1) return undefined;
  }
  // Rows: each item's margin box at its start row's top; rows sized like CSS (solveRows) from those boxes.
  const rowGap = px(s["row-gap"]);
  const heights = items.map((item) => item.bounds.h + px(item.styles["margin-top"]) + px(item.styles["margin-bottom"]));
  const rowsH = solveRows(
    explicit,
    autoRow[0]!,
    rowGap,
    placements.map((p, i) => ({ row: p.rowStart, span: p.rowSpan, height: heights[i]! })),
  );
  const stretch = alignItems === "normal" || alignItems === "stretch";
  const y0 = n.bounds.y + insets[0];
  for (const [i, item] of items.entries()) {
    const p = placements[i]!;
    const top = y0 + extent(rowsH, 0, p.rowStart - 1, rowGap) + (p.rowStart > 1 ? rowGap : 0);
    if (!near(rowTop(item), top)) return undefined;
    if (stretch && !p.fixed && !near(heights[i]!, extent(rowsH, p.rowStart - 1, p.rowSpan, rowGap))) return undefined;
  }
  const pxRows = [...explicit, autoRow[0]!].some((r) => r.kind === "px");
  return {
    template,
    stretch,
    ...(pxRows && explicit.length ? { rows: explicit } : {}),
    ...(pxRows && autoRow[0]!.kind === "px" ? { autoRow: autoRow[0]! } : {}),
    placements,
  };
}
