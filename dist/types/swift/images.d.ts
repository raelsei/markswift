import type { Paint } from "../css/index.ts";
import type { SemNode, ImageNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
type ImagePaint = Extract<Paint, {
    kind: "image";
}>;
/**
 * An image sized and placed like a CSS background layer: a box-filling `Color.clear` carries
 * the image as an overlay so cover/contain overflow is aligned to the box and clipped by the
 * caller. Vector sources are scaled here (cover/contain/explicit size against the intrinsic SVG viewport);
 * raster ones let SwiftUI scale. Repeats tile through `MarkswiftTile` whenever the tile size is
 * known (vector viewport, decoded raster header or explicit size). Unresolved raster sizes use `.tile`.
 * `undefined` when the source cannot be shown (noted on the node).
 */
export declare function imageLayer(p: ImagePaint, n: SemNode, prop: string, ctx: EmitContext): string[] | undefined;
/**
 * `<img>`: the source at the IR's content mode. A source that cannot produce pixels falls back to
 * the alt text in the measured box, where the browser draws it too; `alt` is also the
 * accessibility label, and `alt=""` marks the image decorative.
 */
export declare function imageNodeExpr(n: ImageNode, ctx: EmitContext): string[];
export {};
