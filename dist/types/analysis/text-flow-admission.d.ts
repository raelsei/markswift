import type { TextNode, TextRun } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
export declare function naturalLineHeight(f: TextRun["font"], metrics: FontMetrics): number;
/** Whole-word CSS flow for measured plain text; legacy paragraphs retain their previous route. */
export declare function usesGreedyWords(n: TextNode): boolean;
