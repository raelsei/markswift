/** Rebase the observed cell text into its intrinsic box before row/span alignment. */
import type { Rect } from "../model/layout.ts";
import type { TextNode } from "../model/semantic.ts";
export declare function tableTextContent(node: TextNode, frame: Rect): void;
