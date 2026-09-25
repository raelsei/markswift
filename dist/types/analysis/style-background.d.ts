/** Computed background paint and text-clipped gradients. */
import type { LayoutNode, Rect } from "../model/layout.ts";
import { type Paint } from "../css/index.ts";
/**
 * `background-clip: text` — the box's first gradient layer becomes the glyph fill of `run`
 * (a text-node box inside `el`), re-expressed over that box since native text fills span the
 * glyph run while the browser painted across the whole element. Text builders attach it to
 * the run; `styleOf` drops the box fills in return.
 */
export declare function textPaintOf(el: LayoutNode, run: Rect): Paint | undefined;
/**
 * `url()` layer `i` of `background-*` / `mask-*` → image paint with its size, top-left
 * position and repeat resolved in px. The position needs the drawn size: explicit
 * `background-size`, the intrinsic size of a data: svg, or the cover/contain scaling of
 * that; unknown (raster files) → only a `0% 0%` position is certain.
 */
export declare function imagePaint(url: string, s: Record<string, string>, prop: "background" | "mask", i: number, w: number, h: number): Paint;
export declare function backgroundFills(s: Record<string, string>, w: number, h: number, notes: string[]): Paint[];
