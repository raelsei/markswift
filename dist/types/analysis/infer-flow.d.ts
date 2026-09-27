import type { LayoutNode } from "../model/layout.ts";
import type { Axis, SemBase, StackNode } from "../model/semantic.ts";
import type { AnalyzedChild, InferenceContext } from "./context.ts";
/** Build a grid-free flow stack and decide whether measured overflow needs scrolling. */
export declare function buildFlowStack(n: LayoutNode, base: SemBase, items: AnalyzedChild[], axis: Axis, display: string, ctx?: InferenceContext): StackNode;
