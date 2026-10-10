/** Pure transforms interpretation of browser-resolved CSS values. */
import { round2 } from "./syntax.ts";
import { hue } from "./color.ts";
import type { Transform2D } from "../model/values.ts";


/**
 * Computed `transform: matrix(a, b, c, d, tx, ty)` or `matrix3d(…)` → rotation/scale/skew/
 * translation (2 decimals). A 3D matrix keeps only its x/y affine part (orthographic
 * flattening, the way a `rotateY(30deg)` looks squeezed) and is marked `flattened`.
 */
export function parseTransform(s: string | undefined): Transform2D | undefined {
  const m = matrixOf(s);
  if (!m) return undefined;
  const t = decompose(...m.m);
  if (m.flattened) t.flattened = true;
  return t;
}

type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

/** Computed `matrix(…)`/`matrix3d(…)` → its 2D affine part (`flattened` when z/perspective terms were dropped). */
function matrixOf(s: string | undefined): { m: Matrix; flattened: boolean } | undefined {
  if (!s || s === "none") return undefined;
  const m = /^(matrix|matrix3d)\(([^)]+)\)$/.exec(s.trim());
  if (!m) return undefined;
  const v = m[2]!.split(",").map((x) => parseFloat(x));
  if (m[1] === "matrix") return v.length === 6 ? { m: v as Matrix, flattened: false } : undefined;
  if (v.length !== 16) return undefined;
  // Column-major m11 m12 m13 m14 m21 … m44: affine 2D iff no z / perspective terms.
  const zeros = [2, 3, 6, 7, 8, 9, 11, 14];
  const flattened = zeros.some((i) => v[i] !== 0) || v[10] !== 1 || v[15] !== 1;
  return { m: [v[0]!, v[1]!, v[4]!, v[5]!, v[12]!, v[13]!], flattened };
}

/** CSS 2×3 product: x′ = a·x + c·y + e, y′ = b·x + d·y + f. */
function mul([a1, b1, c1, d1, e1, f1]: Matrix, [a2, b2, c2, d2, e2, f2]: Matrix): Matrix {
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

export interface TransformLoss { level: "approximated" | "unmapped"; feature: "translate" | "rotate" | "transform" | "transform: matrix3d()"; message: string }

/** One `translate` component: `±Npx`/`±N%` terms, optionally in `calc(…)`; `%` of `ref`. */
function translateLength(t: string, ref: number): number | undefined {
  const body = t.replace(/^calc\((.*)\)$/, "$1").replace(/\s+/g, "");
  if (!/^([+-]?[\d.]+(?:e[+-]?\d+)?(?:px|%))+$/i.test(body)) return undefined;
  let v = 0;
  for (const [, n, unit] of body.matchAll(/([+-]?[\d.]+(?:e[+-]?\d+)?)(px|%)/gi)) v += unit === "%" ? (+n! * ref) / 100 : +n!;
  return v;
}

/**
 * The element's whole 2D transform, composed the CSS Transforms 2 way:
 * translate · rotate · scale · transform, all about one transform-origin.
 * `w`/`h` = border box (the reference box for % translations). `losses` = what could not be represented.
 */
export function cssTransform(s: Record<string, string | undefined>, w: number, h: number): { transform?: Omit<Transform2D, "flattened"> & { origin?: [number, number] }; losses: TransformLoss[] } {
  const losses: TransformLoss[] = [];
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const tr = s["translate"];
  if (tr && tr !== "none") {
    const parts = tr.trim().split(/\s+(?![^(]*\))/);
    const x = translateLength(parts[0]!, w), y = parts[1] ? translateLength(parts[1], h) : 0;
    const z = parts[2] ? translateLength(parts[2], 0) : 0;
    if (parts.length > 3 || x === undefined || y === undefined || z === undefined) losses.push({ level: "unmapped", feature: "translate", message: `translate ${tr}` });
    else {
      m = [1, 0, 0, 1, x, y];
      if (z !== 0) losses.push({ level: "approximated", feature: "translate", message: "translate z dropped" });
    }
  }
  const rot = s["rotate"];
  if (rot && rot !== "none") {
    const deg = /\s/.test(rot.trim()) ? undefined : hue(rot.trim());
    if (deg === undefined) losses.push({ level: "unmapped", feature: "rotate", message: `rotate ${rot}${/\s/.test(rot.trim()) ? " (3D)" : ""}` });
    else {
      const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
      m = mul(m, [cos, sin, -sin, cos, 0, 0]);
    }
  }
  const sc = s["scale"];
  if (sc && sc !== "none") {
    // A third (z) value is ignored: z-scale of a flat element is invisible.
    const [sx, sy = sx] = sc.trim().split(/\s+/).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v)));
    if (Number.isFinite(sx) && Number.isFinite(sy)) m = mul(m, [sx!, 0, 0, sy!, 0, 0]);
  }
  const tf = s["transform"];
  const parsed = matrixOf(tf);
  if (parsed) {
    if (parsed.flattened) losses.push({ level: "approximated", feature: "transform: matrix3d()", message: "transform matrix3d flattened to its x/y projection" });
    m = mul(m, parsed.m);
  } else if (tf && tf !== "none") losses.push({ level: "unmapped", feature: "transform", message: `transform ${tf.slice(0, 40)}` });
  const t = decompose(...m);
  if (t.rotate === 0 && t.scaleX === 1 && t.scaleY === 1 && t.tx === 0 && t.ty === 0 && t.skewX === undefined && t.skewY === undefined) return { losses };
  const transform: Omit<Transform2D, "flattened"> & { origin?: [number, number] } = t;
  const origin = parseOrigin(s["transform-origin"]);
  if (origin) transform.origin = origin;
  return { transform, losses };
}


function decompose(a: number, b: number, c: number, d: number, tx: number, ty: number): Transform2D {
  const out: Transform2D = { rotate: 0, scaleX: 1, scaleY: 1, tx: round2(tx), ty: round2(ty) };
  if (a === 1 && c === 0 && d === 1 && b !== 0) {
    out.skewY = round2((Math.atan(b) * 180) / Math.PI);
    return out;
  }
  // A negative determinant is a reflection. Unmatrix (CSS Transforms §decomposing) folds it into
  // the x scale: negate the first column, decompose the rotation-only remainder, then report a
  // negative scaleX. Without this, scaleX(-1) came out as a 180° rotation and scaleY(-1) as identity.
  const flip = a * d - b * c < 0;
  if (flip) {
    a = -a;
    b = 0 - b; // not `-b`: b = 0 would become -0 and report `rotate: -0`
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
  if (flip) out.scaleX = -out.scaleX;
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
