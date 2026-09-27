/** Semantic node base construction and confidence classification. */
import { type SemNode, type SemBase } from "../model/semantic.ts";
import { type LayoutNode } from "../model/layout.ts";
import { type InferenceContext } from "./context.ts";
export declare function finish<T extends SemNode>(node: T): T;
export declare function withBase<T extends Partial<SemNode>>(n: LayoutNode, ctx: InferenceContext, extra: T): SemNode;
export declare function makeBase(n: LayoutNode, ctx: InferenceContext, declared: Record<string, string>, consumesFont?: boolean): SemBase;
