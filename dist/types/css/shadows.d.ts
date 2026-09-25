/** Pure shadows interpretation of browser-resolved CSS values. */
import { type Color } from "./color.ts";
export interface Shadow {
    color: Color;
    x: number;
    y: number;
    blur: number;
    spread: number;
    inset: boolean;
}
/** Computed `box-shadow`: `rgba(…) 0px 12px 34px 0px[, …][ inset]`. */
export declare function parseShadows(s: string | undefined): Shadow[];
