/** Pure effects interpretation of browser-resolved CSS values. */
import type { ClipShape, Filter } from "../model/semantic.ts";
/**
 * Computed `filter` list → ordered entries. Chrome serialises amounts as bare numbers
 * (`grayscale(1)`), lengths in px and angles in deg. `url()` and unknown functions land
 * in `unsupported` (raw text) so the caller can note them.
 */
export declare function parseFilters(s: string | undefined): {
    filters: Filter[];
    unsupported: string[];
};
/**
 * Computed `clip-path` basic shape → px geometry inside a `w`×`h` box. Handles
 * `circle(r at x y)`, `ellipse(rx ry at x y)`, `inset(t r b l round …)`, `polygon(…)`
 * with px/%/`closest-side`/`farthest-side` and `at` keywords. `none`, `path()`, `url()`
 * and reference boxes → undefined.
 */
export declare function parseClipPath(s: string | undefined, w: number, h: number): ClipShape | undefined;
