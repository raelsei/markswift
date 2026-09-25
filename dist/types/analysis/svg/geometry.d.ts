/** Exact SVG path bounds and circular stroke geometry. */
import { type SvgPath } from "../../model/semantic.ts";
import { type Rect } from "../../model/layout.ts";
import { type SvgMatrix } from "./context.ts";
export declare function ringOf(circle: {
    cx: number;
    cy: number;
    r: number;
}, dash: number[], phase: number, ctm: SvgMatrix, vb: [number, number, number, number]): SvgPath["ring"] | undefined;
/** Bounding box of the path's geometry (exact for lines and Bézier curves). */
export declare function pathBounds(d: string): Rect;
