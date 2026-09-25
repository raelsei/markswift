import type { ElementPolicy } from "./types.ts";
/** Pure attribute-based classification, also used before the analyzer merges inline text. */
export declare function classifyElement(tag: string, attrs?: Record<string, string>): ElementPolicy;
