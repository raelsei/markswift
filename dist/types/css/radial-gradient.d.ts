/** CSS Images 3 ending-shape geometry, independently of native paint/layout. */
export type RadialExtent = "closest-side" | "farthest-side" | "closest-corner" | "farthest-corner";
export type GradientLength = {
    value: number;
    unit: "px" | "%";
};
export type RadialSize = RadialExtent | [GradientLength, GradientLength];
export interface RadialGeometrySpec {
    ellipse: boolean;
    center: [number, number];
    /** Retained when a center coordinate is absolute; fractions remain in `center`. */
    position?: [GradientLength, GradientLength];
    /** Absent is the CSS default farthest-corner. */
    size?: RadialSize;
}
/** Reject unresolved syntax instead of silently replacing authored geometry. */
export declare function parseRadialPrelude(prelude: string): RadialGeometrySpec | undefined;
export declare function gradientLength(value: GradientLength, dimension: number): number;
export declare function radialGeometry(paint: RadialGeometrySpec, width: number, height: number): {
    center: [number, number];
    radii: [number, number];
};
