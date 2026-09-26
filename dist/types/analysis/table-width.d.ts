/** Admit only tables whose browser column allocation is safely equal at another width. */
import type { LayoutNode } from "../model/layout.ts";
/** Table, ordinary full-width captions, row groups, rows and cells may fill in this subset. */
export declare function hasEqualFixedTableWidth(root: LayoutNode, node: LayoutNode): boolean;
