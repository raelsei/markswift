/** Traverse SVG groups, instances and shapes with recursive clipping and masks. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SvgScope, type SvgContext } from "./context.ts";
export declare function visitChildren(el: LayoutNode, scope: SvgScope, ctx: SvgContext): void;
