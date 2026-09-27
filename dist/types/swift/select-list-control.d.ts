import type { ControlNode } from "../model/semantic.ts";
/** Exported so native verification executes the exact assignment used by the row's action. */
export declare function selectListActivation(node: ControlNode, state: string): string;
export declare function selectListExpr(node: ControlNode, state: string | undefined, still: boolean): string[];
