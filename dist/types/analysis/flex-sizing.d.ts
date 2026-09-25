import type { LayoutNode } from "../model/layout.ts";
import type { Axis, Size } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
/** Native stacks can share equal leftover space, but cannot reproduce arbitrary CSS allocation. */
export declare function flexGrowthSize(n: LayoutNode, axis: Axis, ctx: InferenceContext, notes: string[]): Size | undefined;
