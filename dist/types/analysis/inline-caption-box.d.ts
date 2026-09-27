import type { TextNode } from "../model/semantic.ts";
import type { LayoutNode } from "../model/layout.ts";
/** Validate the captured plain font-box union; its soft lines never enter the runtime plan. */
export declare function inlineCaptionBoxHeight(text: TextNode, lineHeight: number, source: LayoutNode): number | undefined;
