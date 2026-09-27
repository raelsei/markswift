import type { ControlNode, SemNode } from "../model/semantic.ts";

/** The measured wide toggle route uses a native switch; only drawn marks own their disabled paint. */
export function isDrawnMarkControl(node: SemNode): node is ControlNode {
  return node.kind === "control" && (node.control === "radio"
    || (node.control === "toggle" && !(node.frame.w >= node.frame.h * 1.4 && node.frame.w >= 28)));
}
