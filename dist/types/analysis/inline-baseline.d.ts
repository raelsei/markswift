import type { LayoutNode } from "../model/layout.ts";
import type { StackNode } from "../model/semantic.ts";
import type { AnalyzedChild, InferenceContext } from "./context.ts";
/** A captured widget border baseline is admitted only beside independently measured plain text. */
export declare function inlineBaselineOf(node: LayoutNode, items: AnalyzedChild[], stack: StackNode, context?: InferenceContext): StackNode["inlineBaseline"];
