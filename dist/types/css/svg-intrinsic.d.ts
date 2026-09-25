/** Intrinsic CSS-pixel viewport and user-space viewBox of a standalone SVG resource. */
export interface SvgRootDimensions {
    size?: [number, number];
    viewBox: [number, number, number, number];
    notes: string[];
    /** A zero or negative absolute axis has no usable natural tile size. */
    invalid?: string;
}
/**
 * SVG width/height set the image's natural viewport; viewBox only defines its internal
 * coordinate system. With two missing/percentage axes, an `<img>` fits the viewBox into
 * 300×150 while `background-size:auto` fits it into the background positioning area.
 * A non-positive absolute dimension is a zero-sized resource, not a missing dimension.
 */
export declare function svgRootDimensions(attrs: Record<string, string>, fallbackBox?: [number, number]): SvgRootDimensions | undefined;
