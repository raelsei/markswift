/**
 * 2D affine transform decomposed as `translate(tx, ty) · rotate(rotate) · skewX(skewX) ·
 * skewY(skewY) · scale(scaleX, scaleY)`. Angles in degrees; `skewX`/`skewY` are present
 * only when the matrix has shear (a pure Y shear reports `skewY`, any other shear `skewX`).
 * `flattened` marks a 3D matrix reduced to its x/y projection (depth and perspective lost).
 */
export interface Transform2D {
    rotate: number;
    scaleX: number;
    scaleY: number;
    tx: number;
    ty: number;
    skewX?: number;
    skewY?: number;
    flattened?: true;
}
/**
 * Computed `transform: matrix(a, b, c, d, tx, ty)` or `matrix3d(…)` → rotation/scale/skew/
 * translation (2 decimals). A 3D matrix keeps only its x/y affine part (orthographic
 * flattening, the way a `rotateY(30deg)` looks squeezed) and is marked `flattened`.
 */
export declare function parseTransform(s: string | undefined): Transform2D | undefined;
/** `transform-origin: 17px 158px` → px pair. */
export declare function parseOrigin(s: string | undefined): [number, number] | undefined;
