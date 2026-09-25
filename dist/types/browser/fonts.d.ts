import type { Page } from "playwright-core";
import type { FontFace as FontFaceRecord } from "../model/layout.ts";
/**
 * The page's `@font-face` rules, as the browser resolved them. Two sources, because neither is
 * enough on its own: `document.styleSheets` carries the authored descriptors (`src` with its
 * URLs and formats, `unicode-range`, the weight range of a variable face), while
 * `document.fonts` is the only place that says whether a face actually loaded — i.e. whether
 * the reference pixels are its glyphs or a fallback's. Runs after `settle`, so
 * `document.fonts.ready` has already resolved.
 *
 * Same-origin sheets only: a cross-origin stylesheet throws on `cssRules` and is skipped, which
 * costs nothing here — every adapter serves the design from its own origin.
 */
export declare function collectFontFaces(page: Page): Promise<FontFaceRecord[]>;
/**
 * Reads the bytes behind every non-inline `@font-face` source and names each blob by content
 * hash, mutating the faces to point at the file. Runs in-process while the source's static
 * server is still up: that server is the only thing that can answer its own ephemeral-port URL,
 * and `generate` runs long after it is gone.
 *
 * A source that cannot be read keeps its `url` and gets no `file` — packaging reports it rather
 * than guessing.
 */
export declare function readFontBytes(faces: FontFaceRecord[], allowRemote?: boolean): Promise<Array<{
    name: string;
    bytes: Uint8Array;
}>>;
