/** The rows Chrome actually measured, including the list's captured scroll offset. */
import { parseColor } from "../css/index.ts";
import type { LayoutNode, Rect } from "../model/layout.ts";
import type { ControlNode, SelectRowAppearance } from "../model/semantic.ts";
import type { SourceOption } from "./select-input.ts";
import { insetsOf } from "./geometry.ts";
import { fontOf } from "./typography.ts";

export function selectRowAppearance(node: LayoutNode, height = node.bounds.h): SelectRowAppearance | undefined {
  if (node.bounds.w <= 0 || height <= 0) return undefined;
  const color = parseColor(node.styles.color), background = parseColor(node.styles["background-color"]);
  return { height, padding: insetsOf(node.styles), font: fontOf(node.styles), ...(color ? { color } : {}), ...(background ? { background } : {}) };
}

export function selectGroupHeight(group: LayoutNode, options: SourceOption[]): number {
  const first = options.find(option => option.group === group && option.node.bounds.w > 0 && option.node.bounds.h > 0);
  return Math.min(group.bounds.h, first ? first.node.bounds.y - group.bounds.y : group.bounds.h);
}

export function selectPaintRows(select: LayoutNode, options: SourceOption[], choices: NonNullable<ControlNode["choices"]>): ControlNode["selectRows"] {
  const measured = options.some(({ node, hidden }, index) => !(choices[index]?.hidden ?? hidden) && node.bounds.w > 0 && node.bounds.h > 0);
  if (!measured) return undefined;
  const rows: NonNullable<ControlNode["selectRows"]> = [];
  const groups = new Set<LayoutNode>();
  options.forEach(({ node, group }, choice) => {
    if (choices[choice]?.hidden) return;
    if (group && !groups.has(group)) {
      groups.add(group);
      const heading = { ...group.bounds, h: selectGroupHeight(group, options) };
      add(group, heading, { kind: "group", label: group.attrs.label ?? "" });
    }
    add(node, node.bounds, { kind: "option", choice, label: choices[choice]!.label });
  });
  return rows;

  function add(node: LayoutNode, bounds: Rect, identity: { kind: "option" | "group"; choice?: number; label: string }) {
    if (bounds.w <= 0 || bounds.h <= 0 || bounds.y + bounds.h <= select.bounds.y || bounds.y >= select.bounds.y + select.bounds.h || node.styles.visibility === "hidden") return;
    const { height: _, ...appearance } = selectRowAppearance(node, bounds.h)!;
    rows.push({ ...identity, frame: { ...bounds, x: bounds.x - select.bounds.x, y: bounds.y - select.bounds.y }, ...appearance });
  }
}
