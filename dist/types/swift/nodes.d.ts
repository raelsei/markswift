import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
/** Expression for a node: container → property reference; leaf → inline expression (with modifiers). */
export declare function refOf(n: SemNode, ctx: EmitContext): string;
