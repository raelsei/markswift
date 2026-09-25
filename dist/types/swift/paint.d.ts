import { type Paint } from "../css/index.ts";
import type { Style, SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { type ColorCtx } from "./format.ts";
export declare function shapeExpr(st: Style, w: number, h: number): string;
/** A CSS paint as a SwiftUI style. `ctx`/`id` resolve its colours; see `colorExpr`. */
export declare function paintExpr(p: Paint, w: number, h: number, ctx: ColorCtx, id?: string): string;
/**
 * One background layer: shape styles go through `.background(_:in:)`, images through a clipped
 * view. `background-clip: padding-box | content-box` (`Paint.inset`) pads the painted shape
 * inside the box; the corner radius shrinks with it, close to how Chrome insets the corners.
 */
export declare function fillModifier(p: Paint, n: SemNode, shape: string, ctx: EmitContext): string[];
export declare function swiftBlend(css: string): string | undefined;
/**
 * Background layers where at least one carries a `background-blend-mode`. A chain of
 * `.background` modifiers gives each layer its own compositing group, so a blend would reach
 * past the sibling layers to whatever is behind the node; CSS blends strictly within the
 * node's own background. One `ZStack` (bottom-most first, as the IR stores them) inside a
 * single `.background`, with the blend on the upper layer and a `.compositingGroup()` around
 * the result, is that scope exactly.
 */
export declare function blendedFillModifier(fills: Paint[], n: SemNode, shape: string, ctx: EmitContext): string[];
