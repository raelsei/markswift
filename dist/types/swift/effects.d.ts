import type { Paint, Transform2D } from "../css/index.ts";
import type { SemNode, Filter, ClipShape } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { type ColorCtx } from "./format.ts";
/**
 * Skew has no SwiftUI modifier, so a sheared transform is emitted whole: the `Transform2D`
 * composition `translate · rotate · skewX · skewY · scale`, conjugated by the CSS
 * transform-origin (`T(o) · M · T(−o)`, `o` relative to the node's top-left, default centre)
 * because `.transformEffect` is applied about the view's own origin. CGAffineTransform's
 * `(a, b, c, d, tx, ty)` is the CSS `matrix()` layout, so the components map 1:1.
 */
export declare function affineModifier(t: Transform2D & {
    origin?: [number, number];
}, w: number, h: number): string;
/** One CSS `filter` function → SwiftUI modifier(s); lossy cases are noted on the node. */
export declare function filterModifier(f: Filter, n: SemNode, ctx: ColorCtx): string[];
/**
 * `clip-path` basic shapes. Circle/ellipse are placed with `.size().offset()` in measured px
 * (a centred full circle is just `Circle()`); inset masks with a padded rounded rectangle so it
 * follows the box; polygons become a generated `Shape` in fractions of the measured box.
 */
export declare function clipPathModifier(c: ClipShape, n: SemNode, ctx: EmitContext): string;
/** `mask-image`: the paint's alpha masks the node (gradients directly, images as a layer). */
export declare function maskModifier(p: Paint, n: SemNode, ctx: EmitContext): string[];
