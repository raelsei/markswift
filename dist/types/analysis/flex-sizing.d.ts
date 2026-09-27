import type { LayoutNode } from "../model/layout.ts";
import type { Axis, Size } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
/** Conservative child sizing until the parent proves its complete native flex allocation. */
export declare function flexGrowthSize(n: LayoutNode, axis: Axis, ctx: InferenceContext, notes: string[]): Size | undefined;
