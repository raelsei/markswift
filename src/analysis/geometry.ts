/** Measured box geometry and reusable inset calculations. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type SemNode, type Axis } from "../model/semantic.ts";
import { px } from "../css/index.ts";

/** Rendered at all: a `display: none` box is collapsed away by the browser, so we drop it too. */
export function renders(n: LayoutNode): boolean {
  return n.styles["display"] !== "none";
}

/**
 * Does this box lie entirely left of the content box that starts at `x`? A
 * `list-style-position: outside` marker does: it hangs in the parent's padding and takes no
 * part in the flow, so the text column keeps its own width and wrapped lines stay aligned
 * under the first one. `stackOf` drops such a child; `buildOverlays` draws it where it was.
 */
export function hangsLeading(box: Rect, x: number): boolean {
  return box.w > 0 && box.x + box.w <= x + 0.5;
}

/** Any descendant that fills its width — such a subtree stays greedy inside a hugging container. */
export function fillsWidthInside(n: SemNode): boolean {
  return (
    (n.kind === "stack" || n.kind === "grid") && n.children.some((c) => c.width.kind === "fill" || fillsWidthInside(c))
  );
}

/** Taken out of normal flow to one side, with the line boxes beside it shortened. */
export function floating(n: LayoutNode): boolean {
  return n.styles["float"] === "left" || n.styles["float"] === "right";
}

/** Positioned out of normal flow (`absolute`/`fixed`): placed as an overlay, never laid out by its parent. */
export function outOfFlow(n: LayoutNode): boolean {
  return n.styles["position"] === "absolute" || n.styles["position"] === "fixed";
}

/** A computed `display` that lays out its children as a flex container (`flex`, `inline-flex`). */
export function isFlex(display: string | undefined): boolean {
  return /flex/.test(display ?? "");
}

/** The axis `n` stacks its children on: horizontal only for a row-direction flex container. */
export function mainAxis(n: LayoutNode): Axis {
  return isFlex(n.styles["display"]) && /^row/.test(n.styles["flex-direction"] ?? "row") ? "h" : "v";
}

/**
 * Tops of the measured line boxes under `el`. DOMSnapshot reports inline *fragments* — Blink
 * splits one at every collapsed source newline — so fragments that share a top edge are one
 * line; the same grouping `markLineBreaks` uses to place the forced breaks.
 */
export function lineTops(el: LayoutNode): number[] {
  const boxes: Rect[] = [];
  const collect = (n: LayoutNode) => {
    for (const l of n.lines ?? []) boxes.push(l.bounds);
    for (const c of n.children) collect(c);
  };
  collect(el);
  boxes.sort((a, b) => a.y - b.y);
  const tops: number[] = [];
  for (const b of boxes) if (tops.length === 0 || b.y - tops[tops.length - 1]! >= Math.max(1, b.h / 2)) tops.push(b.y);
  return tops;
}

export const EDGES = ["top", "right", "bottom", "left"] as const;

export type EdgeName = (typeof EDGES)[number];

/** Border width of one edge; 0 when its style paints nothing. */
export function edgeWidth(s: Record<string, string>, edge: EdgeName): number {
  const st = s[`border-${edge}-style`];
  return st && st !== "none" && st !== "hidden" ? px(s[`border-${edge}-width`]) : 0;
}

/**
 * Padding + border per edge (top, right, bottom, left): the distance from the box edge to its content.
 * Rows and row groups have none: CSS ignores their padding, a collapsed border lies inside the cells' boxes
 * and a separated one is not drawn.
 */
export function insetsOf(s: Record<string, string>): [number, number, number, number] {
  if (/^table-(row|row-group|header-group|footer-group)$/.test(s["display"] ?? "")) return [0, 0, 0, 0];
  return EDGES.map((e) => px(s[`padding-${e}`]) + edgeWidth(s, e)) as [number, number, number, number];
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
