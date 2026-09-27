/** Pure paint interpretation of browser-resolved CSS values. */
import { type Color } from "./color.ts";
import { type BlendMode } from "./blend.ts";
import { type BackgroundSize, type BackgroundRepeat } from "./background.ts";
import { type GradientCorner } from "./gradient-line.ts";
import { type RadialGeometrySpec } from "./radial-gradient.ts";
export interface GradientStop {
    color: Color;
    /** 0..1 along the gradient line, undefined = evenly distributed. */
    pos?: number;
    /** Absolute px along the gradient line; `resolvePaint` turns it into `pos` once the box is known. */
    px?: number;
}
/** Px from the node's border-box edge to a fill's painting area (top, right, bottom, left). */
export type PaintInset = {
    inset?: [number, number, number, number];
    /** `background-blend-mode` for this layer, against the layers below it. Absent = `normal`. */
    blend?: BlendMode;
};
/** Absence preserves legacy encoded-sRGB interpolation. */
type GradientInterpolation = {
    interpolation?: "oklab";
};
/**
 * One `background-image` layer (or a solid `background-color`). Gradient variants carry
 * `repeating: true` for `repeating-*-gradient`; `center` is a 0..1 fraction of the box.
 * Image layers carry the resolved `background-size`/`position`/`repeat` (px, box-relative)
 * when the producer knows the box; absent = fill the box. `inset` (any fill) is set for
 * `background-clip: padding-box | content-box`.
 */
export type Paint = ({
    kind: "solid";
    color: Color;
} & PaintInset) | ({
    kind: "linear";
    angle: number;
    corner?: GradientCorner;
    stops: GradientStop[];
    repeating?: true;
} & PaintInset & GradientInterpolation) | ({
    kind: "radial";
    stops: GradientStop[];
    repeating?: true;
} & RadialGeometrySpec & PaintInset & GradientInterpolation) | ({
    kind: "conic";
    stops: GradientStop[];
    from: number;
    center: [number, number];
    repeating?: true;
} & PaintInset & GradientInterpolation) | ({
    kind: "image";
    url: string;
    size?: BackgroundSize;
    position?: [number, number];
    repeat?: BackgroundRepeat;
} & PaintInset) | {
    kind: "unsupported";
    raw: string;
    reason?: string;
};
/**
 * Re-express a gradient painted over `host` so that the same colours land on `sub` (both
 * boxes in one coordinate space): linear stops are projected onto `sub`'s span of the
 * gradient line and cut to 0..1; radial/conic centers move. Used for `background-clip:
 * text`, where the browser paints across the block but the glyph run is what gets filled.
 */
export declare function paintWithin(p: Paint, host: {
    x: number;
    y: number;
    w: number;
    h: number;
}, sub: {
    x: number;
    y: number;
    w: number;
    h: number;
}): Paint;
/** Computed `background-image` → paints, bottom-most first. */
export declare function parseBackgroundImage(s: string | undefined): Paint[];
/**
 * One `background-image` layer: `[repeating-]{linear,radial,conic}-gradient(…)` or
 * `url(…)`; anything else → `unsupported`. Gradient centers given in px stay at the
 * default (50% 50%) because the box size is unknown here.
 */
export declare function parseGradient(s: string): Paint;
export declare function fraction(t: string): number | undefined;
export declare const COLOR_TOKEN: string;
/**
 * Resolve a gradient's px stops against the box it paints: linear stops divide by the
 * gradient-line length (`|w·sin θ| + |h·cos θ|`), radial stops by the farthest-corner
 * distance from the center. Non-repeating stops clamp to 0..1; repeating ones keep their
 * period so the consumer can tile. Paints without px stops are returned as-is.
 */
export declare function resolvePaint(p: Paint, w: number, h: number): Paint;
export {};
