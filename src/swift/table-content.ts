/** Rebase the observed cell text into its intrinsic box before row/span alignment. */
import type { Rect } from "../model/layout.ts";
import type { TextNode } from "../model/semantic.ts";

export function tableTextContent(node: TextNode, frame: Rect): void {
  if (node.lineBox) {
    const top = node.frame.y - frame.y, bottom = frame.y + frame.h - node.frame.y - node.frame.h;
    const box = node.lineBox;
    node.lineBox = { ...box, firstBaseline: box.firstBaseline + top, baselineToBottom: box.baselineToBottom + bottom,
      baselines: box.baselines.map(baseline => baseline + top) };
  }
  node.frame = frame;
}
