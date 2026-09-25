/** Pure color interpretation of browser-resolved CSS values. */
/** sRGB color, channels 0..1 (wide-gamut inputs are gamut-clipped). */
export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}
export declare const TRANSPARENT: Color;
/**
 * Any CSS color Chrome serialises: `transparent`, `#hex` (3/4/6/8), legacy and modern
 * `rgb()/rgba()`, `hsl()/hsla()`, `hwb()`, `lab()/lch()`, `oklab()/oklch()`, and
 * `color(<space> …)` for the CSS Color 4 predefined spaces. Non-sRGB inputs are converted
 * through XYZ D65, clipped to the sRGB gamut and rounded to 4 decimals. Unknown → undefined.
 */
export declare function parseColor(s: string | undefined): Color | undefined;
/** Hue component in degrees (`deg`, `rad`, `grad`, `turn`, bare number, `none`). */
export declare function hue(t: string): number | undefined;
