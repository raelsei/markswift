/** `background-repeat` per layer; `space`/`round` collapse to `repeat`. */
export type BackgroundRepeat = "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
/** Computed `background-repeat` (first layer) → one of the four tile modes; `space`/`round` → `repeat`. */
export declare function parseBackgroundRepeat(s: string | undefined): BackgroundRepeat | undefined;
/**
 * Natural viewport of a `data:image/svg+xml` URL. A viewBox-only resource has an aspect
 * ratio but no absolute dimensions: without `boxW`/`boxH` this uses the browser's 300×150
 * default object, while a background fits that ratio inside its positioning area.
 * Raster and external images are unknown here.
 */
export declare function imageSize(url: string, boxW?: number, boxH?: number): {
    w: number;
    h: number;
} | undefined;
/** Resolved `background-size` layer: explicit px box or the `cover`/`contain` keywords. */
export type BackgroundSize = {
    w: number;
    h: number;
} | "cover" | "contain";
/**
 * One `background-size` layer (first layer of a comma list) → px box, `cover`/`contain`,
 * or undefined when it depends on the image's intrinsic size (`auto`) and `imgW`/`imgH`
 * are not given. `auto` on one axis keeps the image aspect ratio.
 */
export declare function parseBackgroundSize(s: string | undefined, boxW: number, boxH: number, imgW?: number, imgH?: number): BackgroundSize | undefined;
/**
 * One `background-position` layer → `[x, y]` px offset of the image's top-left corner.
 * Handles px, `%`, `calc()`, side keywords (`left center right top bottom`) and the
 * 3/4-value `right 10px bottom 20px` form. Percentages and far-side offsets resolve
 * against `box − image` when `imgW`/`imgH` are given, else against the box.
 */
export declare function parseBackgroundPosition(s: string | undefined, boxW: number, boxH: number, imgW?: number, imgH?: number): [number, number];
