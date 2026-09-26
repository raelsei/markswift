/** Admit only tables whose browser column allocation is safely equal at another width. */
import type { LayoutNode } from "../model/layout.ts";
import { px } from "../css/index.ts";
import { insetsOf } from "./geometry.ts";

const tableWidths = new WeakMap<LayoutNode, WeakSet<LayoutNode>>();
const groups = new Set(["thead", "tbody", "tfoot"]);
const cells = new Set(["td", "th"]);

/** Table, ordinary full-width captions, row groups, rows and cells may fill in this subset. */
export function hasEqualFixedTableWidth(root: LayoutNode, node: LayoutNode): boolean {
  let indexed = tableWidths.get(root);
  if (!indexed) {
    indexed = new WeakSet<LayoutNode>();
    indexTables(root, undefined, indexed);
    tableWidths.set(root, indexed);
  }
  return indexed.has(node);
}

function indexTables(node: LayoutNode, parent: LayoutNode | undefined, indexed: WeakSet<LayoutNode>): void {
  if (node.tag === "table") {
    const members = equalFixedTable(node, parent);
    if (members) for (const member of members) indexed.add(member);
  }
  for (const child of node.children) indexTables(child, node, indexed);
}

function equalFixedTable(table: LayoutNode, parent: LayoutNode | undefined): LayoutNode[] | undefined {
  if (table.styles["table-layout"] !== "fixed" || table.styles.display !== "table" ||
    table.preferredSize?.width !== "100%" || (parent && parent.styles.display !== "block") ||
    !ordinary(table) || !unconstrained(table)) return;
  if (parent) {
    const [, right, , left] = insetsOf(parent.styles);
    const available = parent.bounds.w - left - right;
    if (Math.abs(table.bounds.w - available) > 1) return;
  }

  const members: LayoutNode[] = [table];
  const rows: LayoutNode[] = [];
  let caption: LayoutNode | undefined;
  for (const child of table.children) {
    if (child.tag === "tr") rows.push(child);
    else if (child.tag === "caption" && !caption && ordinary(child) && autoWidth(child) && unconstrained(child) &&
      child.styles.display === "table-caption" && Math.abs(child.bounds.w - table.bounds.w) <= 1 &&
      Math.abs(child.bounds.x - table.bounds.x) <= 1) {
      caption = child;
      members.push(child);
    }
    else if (groups.has(child.tag) && ordinary(child) && autoWidth(child)) {
      members.push(child);
      if (!child.children.length || child.children.some((row) => row.tag !== "tr")) return;
      rows.push(...child.children);
    } else return; // Constrained captions, colgroups and anonymous/irregular tracks need their own model.
  }
  if (!rows.length) return;

  let columns = 0;
  let edges: number[] | undefined;
  for (const row of rows) {
    if (!ordinary(row) || !autoWidth(row) || row.styles.display !== "table-row") return;
    const rowCells = row.children;
    if (rowCells.length < 2 || rowCells.some((cell) =>
      !cells.has(cell.tag) || !ordinary(cell) || !autoWidth(cell) ||
      cell.styles.display !== "table-cell" ||
      cell.attrs.colspan !== undefined || cell.attrs.rowspan !== undefined ||
      cell.attrs.width !== undefined ||
      (cell.styles["min-width"] !== undefined && !/^(?:auto|0(?:px)?)$/.test(cell.styles["min-width"])) ||
      (cell.styles["max-width"] !== undefined && cell.styles["max-width"] !== "none")
    )) return;
    if (columns && rowCells.length !== columns) return;
    columns = rowCells.length;
    const share = row.bounds.w / columns;
    if (!(share > 0) || rowCells.some((cell) => Math.abs(cell.bounds.w - share) > 1)) return;
    const currentEdges = rowCells.map((cell) => cell.bounds.x - row.bounds.x);
    if (edges && currentEdges.some((edge, i) => Math.abs(edge - edges![i]!) > 1)) return;
    edges = currentEdges;
    members.push(row, ...rowCells);
  }
  return members;
}

function autoWidth(node: LayoutNode): boolean {
  return (node.preferredSize?.width ?? "auto") === "auto" && node.attrs.width === undefined;
}

function ordinary(node: LayoutNode): boolean {
  const styles = node.styles;
  return (styles.position === undefined || styles.position === "static") &&
    (styles.float === undefined || styles.float === "none") &&
    (styles.direction === undefined || styles.direction === "ltr") &&
    (styles["writing-mode"] === undefined || styles["writing-mode"] === "horizontal-tb") &&
    (styles.transform === undefined || styles.transform === "none");
}

function unconstrained(node: LayoutNode): boolean {
  const styles = node.styles;
  return (styles["min-width"] === undefined || /^(?:auto|0(?:px)?)$/.test(styles["min-width"])) &&
    (styles["max-width"] === undefined || styles["max-width"] === "none") &&
    px(styles["margin-left"]) === 0 && px(styles["margin-right"]) === 0;
}
