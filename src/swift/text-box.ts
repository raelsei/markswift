/** Alignment shared by native text and its surrounding CSS size constraints. */
import type { TextNode } from "../model/semantic.ts";

export function clipsFirstLine(n: TextNode): boolean {
  const font = n.runs.find(run => run.gap === undefined)?.font;
  const lineHeight = font?.lineHeight ?? (font ? font.size * 1.193359 : 0);
  return n.maxHeight !== undefined && n.frame.h - n.padding[0] - n.padding[2] < lineHeight - 0.5;
}

export function textBoxAlignment(n: TextNode, top = false): string {
  if (!top) return n.align === "center" ? ".center" : n.align === "trailing" ? ".trailing" : ".leading";
  return n.align === "center" ? ".top" : n.align === "trailing" ? ".topTrailing" : ".topLeading";
}
