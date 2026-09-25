/** Measured box geometry and reusable inset calculations. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type SemNode } from "../model/semantic.ts";
/** Rendered at all: a `display: none` box is collapsed away by the browser, so we drop it too. */
export declare function renders(n: LayoutNode): boolean;
/**
 * Does this box lie entirely left of the content box that starts at `x`? A
 * `list-style-position: outside` marker does: it hangs in the parent's padding and takes no
 * part in the flow, so the text column keeps its own width and wrapped lines stay aligned
 * under the first one. `stackOf` drops such a child; `buildOverlays` draws it where it was.
 */
export declare function hangsLeading(box: Rect, x: number): boolean;
/** Any descendant that fills its width — such a subtree stays greedy inside a hugging container. */
export declare function fillsWidthInside(n: SemNode): boolean;
/** Taken out of normal flow to one side, with the line boxes beside it shortened. */
export declare function floating(n: LayoutNode): boolean;
/**
 * Tops of the measured line boxes under `el`. DOMSnapshot reports inline *fragments* — Blink
 * splits one at every collapsed source newline — so fragments that share a top edge are one
 * line; the same grouping `markLineBreaks` uses to place the forced breaks.
 */
export declare function lineTops(el: LayoutNode): number[];
export declare const EDGES: readonly ["top", "right", "bottom", "left"];
export type EdgeName = (typeof EDGES)[number];
/** Border width of one edge; 0 when its style paints nothing. */
export declare function edgeWidth(s: Record<string, string>, edge: EdgeName): number;
/** Padding + border per edge (top, right, bottom, left): the distance from the box edge to its content. */
export declare function insetsOf(s: Record<string, string>): [number, number, number, number];
export declare function unionRect(a: Rect, b: Rect): Rect;
