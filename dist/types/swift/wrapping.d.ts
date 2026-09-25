/** Fixed-item native row reflow; unsupported flex rules use measured placement. */
import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
export declare function wrappingExpr(n: StackNode, ctx: EmitContext): string[];
