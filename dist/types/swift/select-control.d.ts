/** A single HTML select uses ordinal state: duplicate labels and values remain separate choices. */
import type { ControlNode } from "../model/semantic.ts";
export declare function selectExpr(node: ControlNode, state: string | undefined, still: boolean, label: string[]): string[];
