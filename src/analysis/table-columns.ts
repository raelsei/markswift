/** Width intent and first-row precedence for the admitted fixed-table subset. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableColumn } from "../model/table.ts";
import type { TableMember } from "./table-structure.ts";
import { px, parseDeclared } from "../css/index.ts";
import { edgeWidth, insetsOf } from "./geometry.ts";

export function declaredTableColumns(columns: LayoutNode[], count: number, placed: TableMember[], collapsed: boolean,
  gap: number[], decline: (reason: string) => undefined): TableColumn[] | undefined {
  const tracks = declaredTracks(columns, count);
  if (!tracks) return decline("column/colgroup width intent or span syntax is unsupported");
  for (const member of placed.filter(member => member.placement.row === 0)) {
    const { node, placement: p } = member;
    const width = intent(node);
    if (width === "auto") continue;
    const explicit = track(width);
    if (!explicit) return decline("first-row widths must be resolved pixels or simple percentages");
    const affected = tracks.slice(p.column, p.column + p.columnSpan);
    if (affected.every(column => column.kind !== "auto")) continue; // Column declarations take precedence.
    if (affected.some(column => column.kind !== "auto")) return decline("a width-bearing spanning cell mixes specified and unspecified columns");
    const boxInsets = insetsOf(node.styles);
    const border = edgeWidth(node.styles, "left") + edgeWidth(node.styles, "right");
    const extra = node.styles["box-sizing"] === "border-box" ? 0 : boxInsets[1] + boxInsets[3] - (collapsed ? border / 2 : 0);
    for (let i = p.column; i < p.column + p.columnSpan; i++) tracks[i] = {
      ...explicit, value: explicit.value! / p.columnSpan, extra: (extra - gap[0]! * (p.columnSpan - 1)) / p.columnSpan,
    };
  }
  return tracks;
}

function declaredTracks(nodes: LayoutNode[], count: number): TableColumn[] | undefined {
  const result: TableColumn[] = [];
  const add = (node: LayoutNode, inherited = "auto") => {
    const width = intent(node) === "auto" ? inherited : intent(node);
    const value = track(width);
    const repeat = span(node.attrs.span, 1000);
    if (!value || !repeat) return false;
    for (let i = 0; i < repeat; i++) result.push({ ...value });
    return true;
  };
  for (const node of nodes) {
    if (!ordinary(node)) return;
    if (node.tag === "colgroup" && node.children.length) {
      for (const child of node.children) if (child.tag !== "col" || !ordinary(child) || !add(child, intent(node))) return;
    } else if (!add(node)) return;
  }
  if (result.length > count) return;
  while (result.length < count) result.push({ kind: "auto" });
  return result;
}

export function intent(node: LayoutNode, axis: "width" | "height" = "width"): string {
  const preferred = node.preferredSize?.[axis] ?? parseDeclared(node.attrs.style)[axis];
  if (preferred && preferred !== "auto") return preferred;
  const attribute = node.attrs[axis];
  return attribute ? /^\d+(?:\.\d+)?$/.test(attribute) ? `${attribute}px` : attribute : preferred ?? "auto";
}
function track(value: string): TableColumn | undefined {
  if (value === "auto") return { kind: "auto" };
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|%)$/.exec(value);
  if (!match) return;
  return { kind: match[2] === "%" ? "fraction" : "fixed", value: Number(match[1]) / (match[2] === "%" ? 100 : 1) };
}
export function span(value: string | undefined, limit: number, zero = false): number | undefined {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) return;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= (zero ? 0 : 1) && count <= limit ? count : undefined;
}
export function spacing(value: string | undefined): number[] | undefined {
  if (!value) return;
  const parts = value.split(/\s+/);
  if (parts.length > 2 || parts.some(part => !/^\d+(?:\.\d+)?px$/.test(part))) return;
  return [px(parts[0]), px(parts[1] ?? parts[0])];
}
export function ordinary(node: LayoutNode): boolean {
  const styles = node.styles;
  return (!styles.position || styles.position === "static") && (!styles.float || styles.float === "none")
    && (!styles.direction || styles.direction === "ltr") && (!styles["writing-mode"] || styles["writing-mode"] === "horizontal-tb")
    && (!styles.transform || styles.transform === "none") && styles.visibility !== "collapse";
}
export function unconstrained(node: LayoutNode): boolean {
  const styles = node.styles;
  return (!styles["min-width"] || /^(?:auto|0(?:px)?)$/.test(styles["min-width"]))
    && (!styles["max-width"] || styles["max-width"] === "none") && !px(styles["margin-left"]) && !px(styles["margin-right"]);
}
export function close(a: number, b: number): boolean { return Math.abs(a - b) <= 0.8; }
