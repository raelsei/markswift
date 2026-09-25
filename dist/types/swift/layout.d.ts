import type { StackNode, GridNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
export declare function containerExpr(n: StackNode | GridNode, ctx: EmitContext): string[];
