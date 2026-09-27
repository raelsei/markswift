import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
/** Background and border stay at the same places in the shared modifier chain. */
export declare function fieldsetFillModifiers(node: SemNode, shape: string, ctx: EmitContext): string[];
export declare function fieldsetBorderModifiers(node: SemNode, shape: string, ctx: EmitContext): string[];
export declare function fieldsetLegendModifier(node: SemNode): string[];
