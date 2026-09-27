import type { LayoutNode } from "../model/layout.ts";
import type { ControlNode } from "../model/semantic.ts";
/** Chrome's supported native control schemes, independently of prefers-color-scheme page CSS. */
export declare function markColorScheme(node: LayoutNode, notes: string[]): ControlNode["markColorScheme"];
