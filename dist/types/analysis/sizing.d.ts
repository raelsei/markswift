/** Intrinsic versus fixed sizing inferred from measured content. */
import { type LayoutNode } from "../model/layout.ts";
import { type Size, type SizeConstraints } from "../model/semantic.ts";
import { type InferenceContext } from "./context.ts";
/**
 * The box's bottom inset as the browser left it: its own padding, plus the last in-flow child's
 * bottom margin when a padded box keeps it from collapsing through. A hugging box has nowhere
 * else to put that gap — a stack's spacing only lives between children — so it becomes inset.
 * Only for boxes whose children are all elements: text-node boxes are glyph areas, and their
 * line-box slack would masquerade as a margin.
 */
export declare function trailingInset(n: LayoutNode, height: Size, padBottom: number): number;
/**
 * Cascaded preferred width/height retain fixed-size intent; older captures use inline styles.
 * Otherwise geometry tells: parent content box → fill, own content → hug, other sizes →
 * measured pixels. Flex allocation and constraints share the same border-box contract.
 */
export declare function sizeOf(n: LayoutNode, d: Record<string, string>, ctx: InferenceContext, notes: string[]): SizeConstraints & {
    width: Size;
    height: Size;
    selfAlign?: "center" | "end";
};
