import type { LayoutNode } from "../model/layout.ts";
import type { GridPlacement } from "../model/grid.ts";
import { gridAxisPlacement } from "../css/grid-placement.ts";

/** Sparse row auto-placement preserves source ordering; positions come only from CSS lines. */
export function gridPlacements(nodes: LayoutNode[], columns: number, flow = "row", explicitRows?: number):
  { placements?: GridPlacement[]; rows?: number; reason?: string } {
  if (flow !== "row") return { reason: "dense or column grid auto-flow" };
  const specs = nodes.map(node => ({
    column: gridAxisPlacement(node.styles["grid-column-start"], node.styles["grid-column-end"], columns),
    row: gridAxisPlacement(node.styles["grid-row-start"], node.styles["grid-row-end"], explicitRows),
  }));
  if (specs.some(spec => !spec.column || !spec.row)) return { reason: "named or unproved grid lines" };
  if (specs.some(spec => spec.row!.span !== 1)) return { reason: "row spans require intrinsic track distribution" };
  if (specs.some(spec => spec.column!.span > columns || (spec.column!.start !== undefined
    && (spec.column!.start! < 0 || spec.column!.start! + spec.column!.span > columns)))) return { reason: "implicit grid columns" };
  if (specs.some(spec => spec.row!.start !== undefined && (spec.row!.start! < 0 || spec.row!.start! >= 256))) return { reason: "grid row range" };
  const placements: GridPlacement[] = new Array(nodes.length);
  const occupied = new Set<string>();
  const fits = (row: number, column: number, span: number) => column + span <= columns
    && Array.from({ length: span }, (_, i) => `${row}/${column + i}`).every(cell => !occupied.has(cell));
  const place = (index: number, row: number, column: number) => {
    const span = specs[index]!.column!.span;
    if (row >= 256 || !fits(row, column, span)) return false;
    placements[index] = { row, column, columnSpan: span };
    for (let i = 0; i < span; i++) occupied.add(`${row}/${column + i}`);
    return true;
  };
  const ordered = nodes.map((node, index) => ({ index, order: Number(node.styles.order ?? 0) }))
    .sort((a, b) => a.order - b.order || a.index - b.index).map(item => item.index);
  for (const i of ordered) {
    const spec = specs[i]!;
    if (spec.row!.start !== undefined && spec.column!.start !== undefined && !place(i, spec.row!.start!, spec.column!.start!)) {
      return { reason: "overlapping grid cells" };
    }
  }
  const rowEnds = new Map<number, number>();
  for (const i of ordered) {
    const spec = specs[i]!;
    if (placements[i] || spec.row!.start === undefined) continue;
    const row = spec.row!.start!;
    let column = rowEnds.get(row) ?? 0;
    while (column < columns && !fits(row, column, spec.column!.span)) column++;
    if (!place(i, row, column)) return { reason: "implicit grid columns" };
    rowEnds.set(row, column + spec.column!.span);
  }
  let row = 0, column = 0;
  for (const i of ordered) {
    if (placements[i]) continue;
    const spec = specs[i]!.column!;
    if (spec.start !== undefined) {
      if (spec.start < column) row++;
      column = spec.start;
      while (row < 256 && !fits(row, column, spec.span)) row++;
    } else {
      while (row < 256 && !fits(row, column, spec.span)) {
        column++;
        if (column + spec.span > columns) { row++; column = 0; }
      }
    }
    if (!place(i, row, column)) return { reason: "grid row range" };
  }
  return { placements, rows: Math.max(explicitRows ?? 0, ...placements.map(item => item.row + 1), 0) };
}
