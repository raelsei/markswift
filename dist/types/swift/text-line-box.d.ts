/** Places native text from measured baseline geometry rather than vertical centering. */
import type { FontSpec, TextNode } from "../model/semantic.ts";
import type { EmitMode } from "./context.ts";
/** Match fontExpr's nearest named weight, including its lower-weight tie break. */
export declare function nativeTextWeight(font: FontSpec): string;
export declare function textLineBoxExpr(node: TextNode, mode: EmitMode, content: string[], spacing: number, greedy?: boolean, width?: number): string[];
