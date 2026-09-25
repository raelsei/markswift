import type { SvgNode } from "../model/semantic.ts";
import { type ColorCtx } from "./format.ts";
/**
 * Expression lines for an SVG node; registers any new Shape structs in `shapes` (name → source).
 * `id` is the node the colours belong to, for the token lookup: an `<svg>` node of the IR. An
 * SVG inlined through an `<img>` has no enumerated colours, so it passes none and stays literal.
 */
export declare function svgExpr(n: SvgNode, shapes: Record<string, string>, ctx: ColorCtx, id?: string): string[];
