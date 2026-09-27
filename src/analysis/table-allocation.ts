import type { TableColumn } from "../model/table.ts";

/** CSS fixed layout: declared tracks first, remaining tracks share the unassigned space. */
export function allocateTableColumns(columns: TableColumn[], available: number): number[] | undefined {
  if (!(available > 0) || !Number.isFinite(available) || !columns.length) return;
  const widths = columns.map(column => column.kind === "auto" ? 0
    : (column.kind === "fraction" ? available * column.value! : column.value!) + (column.extra ?? 0));
  if (widths.some(width => !Number.isFinite(width) || width < 0)) return;
  const automatic = columns.filter(column => column.kind === "auto").length;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total > available + 0.1) return; // Overcommitted widths need browser-specific shrinking/overflow rules.
  if (automatic) {
    const share = Math.max(0, available - total) / automatic;
    return widths.map((width, i) => columns[i]!.kind === "auto" ? share : width);
  }
  const fixedTotal = widths.reduce((sum, width, i) => sum + (columns[i]!.kind === "fixed" ? width : 0), 0);
  const fractionTotal = total - fixedTotal;
  // Chrome preserves specified percentages when expanding explicitly sized fixed tracks.
  // With only one class of specified track it expands in proportion to the declared widths.
  if (fixedTotal > 0 && fractionTotal > 0) {
    return widths.map((width, i) => columns[i]!.kind === "fixed" ? width * (available - fractionTotal) / fixedTotal : width);
  }
  return total > 0 ? widths.map(width => width * available / total) : undefined;
}
