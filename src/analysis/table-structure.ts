/** HTML table slots and spans; cell coordinates are checked separately against geometry. */
import type { LayoutNode } from "../model/layout.ts";
import type { TablePlacement } from "../model/table.ts";
import { ordinary, unconstrained, intent, span } from "./table-columns.ts";
import { tableGroupEffectReason } from "./table-group-effects.ts";

export interface TableMember { node: LayoutNode; placement: TablePlacement; parent?: LayoutNode }
export interface TableStructure {
  rows: Array<{ node: LayoutNode; group?: LayoutNode }>;
  columns: LayoutNode[];
  caption?: LayoutNode;
  placed: TableMember[];
  count: number;
}
const groups = new Set(["thead", "tbody", "tfoot"]);
const cells = new Set(["td", "th"]);

export function readTableStructure(table: LayoutNode, decline: (reason: string) => undefined): TableStructure | undefined {
  const rows: Array<{ node: LayoutNode; group?: LayoutNode }> = [];
  const columns: LayoutNode[] = [];
  let caption: LayoutNode | undefined;
  for (const node of table.children) {
    const effect = groups.has(node.tag) ? tableGroupEffectReason(node) : undefined;
    if (effect) return decline(effect);
    if (node.tag === "caption" && !caption) caption = node;
    else if (node.tag === "col" || node.tag === "colgroup") {
      if (node.styles.display === "none") continue;
      if (node.tag === "colgroup" && node.children.length) {
        const children = node.children.filter(child => child.styles.display !== "none");
        if (children.length) columns.push({ ...node, children });
      } else columns.push(node);
    }
    else if (node.tag === "tr") rows.push({ node });
    else if (groups.has(node.tag) && ordinary(node) && intent(node) === "auto" && node.children.every(row => row.tag === "tr")) {
      rows.push(...node.children.map(row => ({ node: row, group: node })));
    } else return decline("anonymous or irregular table structure has no native track mapping");
  }
  if (!rows.length) return decline("table has no rendered rows");
  rows.sort((a, b) => a.node.bounds.y - b.node.bounds.y);
  const occupancy: boolean[][] = rows.map(() => []);
  const placed: TableMember[] = [];
  let count = 0;
  for (let r = 0; r < rows.length; r++) {
    const { node: row, group } = rows[r]!;
    const effect = tableGroupEffectReason(row);
    if (effect) return decline(effect);
    let column = 0;
    for (const cell of row.children) {
      if (!cells.has(cell.tag) || !ordinary(cell) || !unconstrained(cell) || cell.styles.display !== "table-cell"
        || !["top", "middle", "bottom"].includes(cell.styles["vertical-align"] ?? "middle")) {
        return decline("cell constraints, positioning or baseline alignment require captured geometry");
      }
      while (occupancy[r]![column]) column++;
      const columnSpan = span(cell.attrs.colspan, 1000);
      let rowSpan = span(cell.attrs.rowspan, 65534, true);
      if (rowSpan === 0) {
        rowSpan = 1;
        while (r + rowSpan < rows.length && rows[r + rowSpan]!.group === group) rowSpan++;
      }
      if (!columnSpan || rowSpan === undefined || r + rowSpan > rows.length
        || rows.slice(r, r + rowSpan).some(candidate => candidate.group !== group)) return decline("invalid or cross-section cell spans require captured geometry");
      for (let y = r; y < r + rowSpan; y++) for (let x = column; x < column + columnSpan; x++) {
        if (occupancy[y]![x]) return decline("overlapping cell spans require captured geometry");
        occupancy[y]![x] = true;
      }
      placed.push({ node: cell, parent: row, placement: { kind: "cell", row: r, column, rowSpan, columnSpan,
        ...(cell.tag === "th" ? { header: true } : {}), label: cellLabel(cell),
        alignment: cell.styles["vertical-align"] === "top" ? "top" : cell.styles["vertical-align"] === "bottom" ? "bottom" : "center",
        ...(group ? { section: group.tag as "thead" | "tbody" | "tfoot" } : {}),
      } });
      column += columnSpan;
      count = Math.max(count, column);
    }
  }
  if (!count || occupancy.some(row => row.length !== count || Array.from({ length: count }, (_, i) => row[i]).some(value => !value))) {
    return decline("incomplete rows require anonymous cells or browser-only allocation");
  }
  return { rows, columns, caption, placed, count };
}

function cellLabel(node: LayoutNode): string {
  return node.children.map(child => child.tag === "#text" ? child.text ?? "" : cellLabel(child)).join(" ").replace(/\s+/g, " ").trim();
}
