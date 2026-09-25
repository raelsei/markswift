/** Resolve SVG gradient paint servers and inherited stops. */
import { type Rect } from "../../model/layout.ts";
import { type SvgGradient } from "../../model/semantic.ts";
import { type SvgContext } from "./context.ts";
/** `url(#id)` → gradient in user units, or undefined (reported) when the id is not a gradient. */
export declare function gradientOf(raw: string, bbox: Rect, ctx: SvgContext): SvgGradient | undefined;
