/** Effects on inline nodes whose text is merged into a host Text view. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextRun } from "../model/semantic.ts";
/** Opacity is not inherited; visibility is, and a descendant can explicitly restore it. */
export declare function inlinePresentation(host: LayoutNode, element: LayoutNode): {
    opacity: number;
    hidden: boolean;
};
/** Visible inline box decoration collected below the merged glyphs. Computed colors are resolved. */
export declare function inlineBoxHasPaint(inline: LayoutNode): boolean;
/** Keep glyph advances while applying supported paint; report effects lost at the merge. */
export declare function applyInlineEffects(host: LayoutNode, element: LayoutNode, run: TextRun, note: (message: string) => void): void;
