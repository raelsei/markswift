import type { LayoutNode } from "../model/layout.ts";
import type { InferenceContext } from "./context.ts";
/** A percentage is authored intent; it never comes from a measured width ratio. */
export declare function percentageBasis(value: string | undefined): number | undefined;
/** Captures prove external ancestors; legacy trees can prove explicit pixel-root block chains. */
export declare function definiteFlexInlineSize(n: LayoutNode, ctx?: InferenceContext): boolean;
