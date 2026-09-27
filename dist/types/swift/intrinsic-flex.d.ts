import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
/** App-only native sizing; fidelity keeps this stack's measured child frames. */
export declare function intrinsicFlexExpr(n: StackNode, ctx: EmitContext): string[];
