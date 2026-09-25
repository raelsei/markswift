/** SVG presentation attributes, inherited values and references. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SvgScope, type SvgContext } from "./context.ts";
export declare function inherit(parent: Record<string, string>, own: Record<string, string>): Record<string, string>;
/** Presentation value: computed style first, attribute fallback; inside a `<use>` instance `currentColor` follows the use element. */
export declare function styleProp(c: LayoutNode, attrs: Record<string, string>, k: string, scope: SvgScope): string | undefined;
/** `url(#id)` target from an attribute or the inline `style` (non-whitelisted properties such as `clip-path`/`mask`). */
export declare function reference(c: LayoutNode, attrs: Record<string, string>, k: string, ctx: SvgContext): LayoutNode | undefined;
export declare function parseDash(s: string | undefined): number[];
export declare function num(s: string | undefined, def?: number): number;
