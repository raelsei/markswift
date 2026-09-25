/** Alignment shared by native text and its surrounding CSS size constraints. */
import type { TextNode } from "../model/semantic.ts";
export declare function clipsFirstLine(n: TextNode): boolean;
export declare function textBoxAlignment(n: TextNode, top?: boolean): string;
