/** Accessibility context for admitted tables without replacing their native controls. */
import type { LayoutNode } from "../model/layout.ts";
import type { SemBase, SemNode } from "../model/semantic.ts";
import type { TableMember, TableSlots } from "./table.ts";

type Context = NonNullable<NonNullable<SemBase["a11y"]>["tableCell"]>;
const label = (n: LayoutNode): string => {
  if (n.attrs["aria-hidden"] === "true") return "";
  return n.attrs["aria-label"] ?? (n.tag === "#text" ? (n.text ?? "") : n.children.map(label).join(" "));
};
const overlaps = (a: number, span: number, b: number, other: number) => a < b + other && b < a + span;

/** Explicit headers win. Scope associates row/column headers; unscoped first-row/column headers cover simple tables. */
export function tableCellContext(cell: TableMember, table: TableSlots): Context {
  const heads = table.cells.filter((c) => c.node.tag === "th" && c !== cell);
  const ids = cell.node.attrs["headers"]?.split(/\s+/).filter(Boolean);
  const associated =
    ids !== undefined
      ? ids.map((id) => heads.find((h) => h.node.attrs["id"] === id)).filter((h): h is TableMember => !!h)
      : heads.filter((h) => {
          const scope = h.node.attrs["scope"];
          const columns = overlaps(h.colStart, h.colSpan, cell.colStart, cell.colSpan);
          const rows = overlaps(h.rowStart, h.rowSpan, cell.rowStart, cell.rowSpan);
          if (scope === "rowgroup") return !!h.group && h.group === cell.group;
          if (scope === "col") return columns;
          if (scope === "row") return rows;
          // colgroup needs the authored column-group model; do not guess it from the header's span.
          if (scope) return false;
          return (
            (h.rowStart === 1 && columns && h.rowStart < cell.rowStart) ||
            (h.rowStart > 1 && h.colStart === 1 && rows && h.colStart < cell.colStart)
          );
        });
  return {
    row: cell.rowStart,
    column: cell.colStart,
    rowSpan: cell.rowSpan,
    columnSpan: cell.colSpan,
    rows: table.heights.length,
    columns: table.widths.length,
    headers: [...new Set(associated.map((h) => label(h.node).replace(/\s+/g, " ").trim()).filter(Boolean))],
  };
}

/** Keep individual controls focusable. Context rides on their accessible leaves, never merged over a whole cell. */
export function applyTableCellContext(n: SemNode, context: Context): void {
  if (n.a11y?.hidden || (n.kind === "grid" && n.table)) return;
  if (
    n.kind === "text" ||
    n.kind === "control" ||
    n.action ||
    (n.kind === "image" && n.alt) ||
    (n.kind === "svg" && n.label)
  ) {
    n.a11y = { ...n.a11y, tableCell: context };
    return;
  }
  if (n.kind === "stack" || n.kind === "grid")
    n.children.forEach((c) => {
      applyTableCellContext(c, context);
    });
}
