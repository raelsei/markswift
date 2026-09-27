import type { ControlNode, SemNode } from "../model/semantic.ts";
/** The measured wide toggle route uses a native switch; only drawn marks own their disabled paint. */
export declare function isDrawnMarkControl(node: SemNode): node is ControlNode;
