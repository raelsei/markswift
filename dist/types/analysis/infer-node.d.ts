import type { LayoutNode } from "../model/layout.ts";
import type { SemNode } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
export declare function build(n: LayoutNode, ctx: InferenceContext): SemNode;
