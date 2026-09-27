/** Column, section and row backgrounds remain below the accessible spanning cells. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableLayout, TablePlacement } from "../model/table.ts";
import type { TableMember, TableStructure } from "./table-structure.ts";
import { span } from "./table-columns.ts";

export function tableLayers(table: LayoutNode, structure: TableStructure, insets: TableLayout["insets"], widths: number[],
  gap: number[], bodyTop: number, bodyBottom: number): TableMember[] {
  const { rows, columns, caption, placed, count } = structure;
  const first = rows[0]!.node, last = rows.at(-1)!.node;
  const full = (kind: TablePlacement["kind"], row: number, rowSpan: number): TablePlacement => ({ kind, row, rowSpan, column: 0, columnSpan: count });
  const members: TableMember[] = [{ node: { ...table, id: `${table.id ?? "table"}#body`, bounds: { ...table.bounds, y: bodyTop, h: bodyBottom - bodyTop } }, placement: full("body", 0, rows.length) }];
  let columnIndex = 0;
  const addColumnPaint = (node: LayoutNode, start: number, columnSpan: number) => {
    const x = table.bounds.x + insets[3] + widths.slice(0, start).reduce((sum, width) => sum + width, 0) + start * gap[0]!;
    const w = widths.slice(start, start + columnSpan).reduce((sum, width) => sum + width, 0) + (columnSpan - 1) * gap[0]!;
    members.push({ node: { ...node, bounds: { x, y: first.bounds.y, w, h: last.bounds.y + last.bounds.h - first.bounds.y } },
      placement: { kind: "section", row: 0, rowSpan: rows.length, column: start, columnSpan } });
  };
  for (const node of columns) {
    if (node.tag === "colgroup" && node.children.length) {
      const extent = node.children.reduce((sum, child) => sum + span(child.attrs.span, 1000)!, 0);
      addColumnPaint(node, columnIndex, extent);
      for (const child of node.children) {
        const extent = span(child.attrs.span, 1000)!;
        addColumnPaint(child, columnIndex, extent);
        columnIndex += extent;
      }
    } else {
      const extent = span(node.attrs.span, 1000)!;
      addColumnPaint(node, columnIndex, extent);
      columnIndex += extent;
    }
  }
  const seen = new Set<LayoutNode>();
  rows.forEach(({ node, group }, index) => {
    if (group && !seen.has(group)) {
      seen.add(group);
      members.push({ node: group, placement: { ...full("section", index, rows.filter(row => row.group === group).length), section: group.tag as "thead" | "tbody" | "tfoot" } });
    }
    members.push({ node, placement: full("row", index, 1) });
  });
  members.push(...placed);
  if (caption) members.push({ node: caption, placement: full("caption", 0, 0) });
  return members;
}
