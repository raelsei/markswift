import type { LayoutNode } from "../model/layout.ts";
/** Flattened table paint layers cannot apply one effect to a section or row's descendants. */
export declare function tableGroupEffectReason(node: LayoutNode): string | undefined;
