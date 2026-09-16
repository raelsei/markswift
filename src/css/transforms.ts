/** Pure transforms interpretation of browser-resolved CSS values. */
import { round2 } from "./syntax.ts";


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
export function parseTransform(s: string | undefined): Transform2D | undefined {
  if (!s || s === "none") return undefined;
  const m = /^(matrix|matrix3d)\(([^)]+)\)$/.exec(s.trim());
  if (!m) return undefined;
  const v = m[2]!.split(",").map((x) => parseFloat(x));
  let a: number, b: number, c: number, d: number, tx: number, ty: number;
  let flattened = false;
  if (m[1] === "matrix") {
    if (v.length !== 6) return undefined;
    [a, b, c, d, tx, ty] = v as [number, number, number, number, number, number];
  } else {
    if (v.length !== 16) return undefined;
    // Column-major m11 m12 m13 m14 m21 … m44: affine 2D iff no z / perspective terms.
    const zeros = [2, 3, 6, 7, 8, 9, 11, 14];
    flattened = zeros.some((i) => v[i] !== 0) || v[10] !== 1 || v[15] !== 1;
    [a, b, c, d, tx, ty] = [v[0]!, v[1]!, v[4]!, v[5]!, v[12]!, v[13]!];
  }
  const t = decompose(a, b, c, d, tx, ty);
  if (flattened) t.flattened = true;
  return t;
}


function decompose(a: number, b: number, c: number, d: number, tx: number, ty: number): Transform2D {
  const out: Transform2D = { rotate: 0, scaleX: 1, scaleY: 1, tx: round2(tx), ty: round2(ty) };
  if (a === 1 && c === 0 && d === 1 && b !== 0) {
    out.skewY = round2((Math.atan(b) * 180) / Math.PI);
    return out;
  }
  // Unmatrix (CSS Transforms §decomposing): rotate · skewX · scale. Shear below 1e-6 is
  // float noise from Chrome's 6-decimal serialisation, not a skew.
  const scaleX = Math.hypot(a, b);
  const shear = (a * c + b * d) / scaleX;
  // Shear that rounds to 0.00° is float noise from Chrome's 6-decimal serialisation.
  const sheared = round2((Math.atan(shear / Math.hypot(c, d)) * 180) / Math.PI) !== 0;
  const scaleY = sheared ? Math.hypot(c - (a / scaleX) * shear, d - (b / scaleX) * shear) : Math.hypot(c, d);
  out.rotate = round2((Math.atan2(b, a) * 180) / Math.PI);
  out.scaleX = round2(scaleX);
  out.scaleY = round2(scaleY);
  if (sheared) out.skewX = round2((Math.atan(shear / scaleY) * 180) / Math.PI);
  return out;
}


/** `transform-origin: 17px 158px` → px pair. */
export function parseOrigin(s: string | undefined): [number, number] | undefined {
  if (!s) return undefined;
  const m = /^([-\d.]+)px\s+([-\d.]+)px/.exec(s);
  return m ? [+m[1]!, +m[2]!] : undefined;
}
