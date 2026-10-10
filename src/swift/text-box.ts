/** Alignment shared by native text and its surrounding CSS size constraints. */
import type { TextNode } from "../model/semantic.ts";
import { alignment } from "./format.ts";

/**
 * Natural line height of a system face, as a multiple of `font-size`: the height SwiftUI gives
 * one `Text` line before `.lineSpacing`. Measured on the verifier's simulator, it equals
 * `CTFontGetAscent + CTFontGetDescent + CTFontGetLeading` at every size from 10 to 60 pt, for
 * every weight and all four `Font.Design` values: Apple keeps the system faces metric-compatible
 * with SF Pro's `hhea` (1950 + 494) / 2048.
 */
export const SYSTEM_LINE_HEIGHT = 1.193359;

export function clipsFirstLine(n: TextNode): boolean {
  const font = n.runs.find((run) => run.gap === undefined)?.font;
  const lineHeight = font?.lineHeight ?? (font ? font.size * SYSTEM_LINE_HEIGHT : 0);
  return n.maxHeight !== undefined && n.frame.h - n.padding[0] - n.padding[2] < lineHeight - 0.5;
}

export function textBoxAlignment(n: TextNode, top = false): string {
  return alignment(n.align === "trailing" ? "end" : n.align, top ? "start" : "center");
}
