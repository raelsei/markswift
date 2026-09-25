/** Normalize browser-computed CSS constraints to the semantic border-box contract. */
import type { LayoutNode } from "../model/layout.ts";
import type { SizeConstraints } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
export declare function constraintsOf(n: LayoutNode, declared: Record<string, string>, ctx: InferenceContext, notes: string[]): SizeConstraints;
