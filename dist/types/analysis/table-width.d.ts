/** Admit only tables whose browser column allocation is safely equal at another width. */
import type { LayoutNode } from "../model/layout.ts";
/** Table, row groups, rows and cells may fill equally in native layout for this subset. */
export declare function hasEqualFixedTableWidth(root: LayoutNode, node: LayoutNode): boolean;
