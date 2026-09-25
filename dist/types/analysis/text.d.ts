/** Construct semantic text nodes from measured inline runs. */
import { type LayoutNode } from "../model/layout.ts";
import { type TextNode } from "../model/semantic.ts";
import { type SourceTextRun, type InferenceContext } from "./context.ts";
/**
 * @param leaf  the host holds nothing but this text → its box is the CSS line box (text-node
 *              boxes from DOMSnapshot are glyph areas and overshoot tight line-heights).
 */
export declare function buildText(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, leaf?: boolean): TextNode;
