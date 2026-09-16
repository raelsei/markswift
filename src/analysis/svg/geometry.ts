/** Exact SVG path bounds and circular stroke geometry. */
import { type SvgPath } from "../../model/semantic.ts";
import { round2 } from "../../css/index.ts";
import { type Rect } from "../../model/layout.ts";
import { default as svgpath } from "svgpath";
import { type SvgMatrix } from "./context.ts";

export function ringOf(
  circle: { cx: number; cy: number; r: number },
  dash: number[],
  phase: number,
  ctm: SvgMatrix,
  vb: [number, number, number, number],
): SvgPath["ring"] | undefined {
  if (dash.length !== 1 || dash[0]! < 2 * Math.PI * circle.r * 0.99) return undefined;
  if (Math.abs(circle.cx - (vb[0] + vb[2] / 2)) > 0.01 || Math.abs(circle.cy - (vb[1] + vb[3] / 2)) > 0.01) return undefined;
  // The transform must be a pure rotation about the centre (or none): the ring is drawn as a native circle.
  const [a, b, c, d, e, f] = ctm;
  if (Math.abs(a - d) > 1e-6 || Math.abs(b + c) > 1e-6 || Math.abs(a * a + b * b - 1) > 1e-6) return undefined;
  if (Math.abs(a * circle.cx + c * circle.cy + e - circle.cx) > 0.01 || Math.abs(b * circle.cx + d * circle.cy + f - circle.cy) > 0.01) return undefined;
  return { r: circle.r, to: round2(Math.max(0, Math.min(1, 1 - phase / dash[0]!))), startAngle: round2((Math.atan2(b, a) * 180) / Math.PI) };
}

// ---------- geometry ----------

/** Bounding box of the path's geometry (exact for lines and Bézier curves). */
export function pathBounds(d: string): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  let cx = 0, cy = 0;
  svgpath(d).unshort().unarc().abs().iterate((seg) => {
    const [cmd, ...a] = seg as [string, ...number[]];
    switch (cmd) {
      case "M":
      case "L":
        cx = a[0]!;
        cy = a[1]!;
        add(cx, cy);
        break;
      case "H":
        cx = a[0]!;
        add(cx, cy);
        break;
      case "V":
        cy = a[0]!;
        add(cx, cy);
        break;
      case "C":
        for (const t of cubicExtrema(cx, a[0]!, a[2]!, a[4]!)) add(cubicAt(cx, a[0]!, a[2]!, a[4]!, t), cy);
        for (const t of cubicExtrema(cy, a[1]!, a[3]!, a[5]!)) add(cx, cubicAt(cy, a[1]!, a[3]!, a[5]!, t));
        cx = a[4]!;
        cy = a[5]!;
        add(cx, cy);
        break;
      case "Q":
        for (const t of quadExtrema(cx, a[0]!, a[2]!)) add(quadAt(cx, a[0]!, a[2]!, t), cy);
        for (const t of quadExtrema(cy, a[1]!, a[3]!)) add(cx, quadAt(cy, a[1]!, a[3]!, t));
        cx = a[2]!;
        cy = a[3]!;
        add(cx, cy);
        break;
    }
  });
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Interior parameters where the cubic's derivative is zero. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function quadExtrema(p0: number, p1: number, p2: number): number[] {
  const den = p0 - 2 * p1 + p2;
  if (Math.abs(den) < 1e-12) return [];
  const t = (p0 - p1) / den;
  return t > 0 && t < 1 ? [t] : [];
}
