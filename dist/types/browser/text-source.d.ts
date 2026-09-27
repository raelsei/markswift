/** Live structural source join before display:contents flattening or layout pruning. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";
import type { TextSourceCapture, TextSourceOccurrence } from "../model/text-source.ts";
export interface LiveTextSourceNode {
    key: string;
    type: number;
    name: string;
    value: string;
    ancestors: TextSourceOccurrence["ancestors"];
}
interface LiveTextSourceTree {
    nodes: LiveTextSourceNode[];
    root: TextSourceCapture["root"];
}
/** Converter-side claims only; the verifier captures its expected ledger independently. */
export declare function readTextSources(page: Page, selector: string): Promise<LiveTextSourceTree>;
export declare function attachTextSources(root: Raw, input: LiveTextSourceTree | LiveTextSourceNode[]): void;
export {};
