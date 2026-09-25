/** Emit measured content coordinates before the owning node's padding and paint. */
import type { GridNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
export declare function measuredLayoutExpr(n: GridNode | StackNode, ctx: EmitContext): string[];
