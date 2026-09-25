/** Resolve SVG labels and measured text placement. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SvgScope, type SvgContext } from "./context.ts";
export declare function collectText(el: LayoutNode, scope: SvgScope, pos: {
    x: number;
    y: number;
}, ctx: SvgContext): void;
export declare function textContent(el: LayoutNode | undefined): string;
