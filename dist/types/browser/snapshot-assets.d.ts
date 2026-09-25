import type { Raw } from "./snapshot-types.ts";
/** Written on `<img>` when the browser chose a `srcset`/`<picture>` candidate other than `src`. */
export declare const CURRENT_SRC_ATTR = "data-h2s-src";
/**
 * Records the `srcset`/`<picture>` candidate the browser actually loaded as
 * `data-h2s-src`, spelled as authored (so it stays a bundlable path), when it
 * is not the plain `src`. Falls back to the absolute URL if no candidate matches.
 */
export declare function markCurrentSrc(img: Raw, currentSrc: string, base: string): void;
/** Candidate URLs of a `srcset` (HTML spec tokenisation: URLs are whitespace-free, descriptors run to the next comma). */
export declare function srcsetUrls(srcset: string): string[];
