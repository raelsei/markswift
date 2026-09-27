import type { GridNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
/** App-only dispatch; fidelity continues to reproduce measured child sizes. */
export declare function weightedLayoutExpr(n: GridNode | StackNode, ctx: EmitContext): string[];
