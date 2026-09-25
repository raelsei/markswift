import type { LayoutNode } from "../model/layout.ts";
import type { InferenceContext, SourceTextRun } from "./context.ts";
/** Partition children in DOM order, retaining inline text and positioned nodes separately. */
export declare function partitionChildren(n: LayoutNode, ctx: InferenceContext): {
    flow: LayoutNode[];
    abs: LayoutNode[];
    runs: SourceTextRun[];
};
