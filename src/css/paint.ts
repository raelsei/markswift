/** Pure paint interpretation of browser-resolved CSS values. */
import { type Color, hue, parseColor, TRANSPARENT } from "./color.ts";
import { type BlendMode } from "./blend.ts";
import { type BackgroundSize, type BackgroundRepeat } from "./background.ts";
import { splitTop } from "./syntax.ts";


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


/**
 * One `background-image` layer (or a solid `background-color`). Gradient variants carry
 * `repeating: true` for `repeating-*-gradient`; `center` is a 0..1 fraction of the box.
 * Image layers carry the resolved `background-size`/`position`/`repeat` (px, box-relative)
 * when the producer knows the box; absent = fill the box. `inset` (any fill) is set for
 * `background-clip: padding-box | content-box`.
 */
export type Paint =
  | ({ kind: "solid"; color: Color } & PaintInset)
  | ({ kind: "linear"; angle: number; stops: GradientStop[]; repeating?: true } & PaintInset)
  | ({ kind: "radial"; stops: GradientStop[]; center: [number, number]; ellipse: boolean; repeating?: true } & PaintInset)
  | ({ kind: "conic"; stops: GradientStop[]; from: number; center: [number, number]; repeating?: true } & PaintInset)
  | ({ kind: "image"; url: string; size?: BackgroundSize; position?: [number, number]; repeat?: BackgroundRepeat } & PaintInset)
  | { kind: "unsupported"; raw: string };


/**
 * Re-express a gradient painted over `host` so that the same colours land on `sub` (both
 * boxes in one coordinate space): linear stops are projected onto `sub`'s span of the
 * gradient line and cut to 0..1; radial/conic centers move. Used for `background-clip:
 * text`, where the browser paints across the block but the glyph run is what gets filled.
 */
export function paintWithin(p: Paint, host: { x: number; y: number; w: number; h: number }, sub: { x: number; y: number; w: number; h: number }): Paint {
  if (p.kind === "radial" || p.kind === "conic") {
    const center: [number, number] = [
      sub.w ? (host.x + p.center[0] * host.w - sub.x) / sub.w : 0.5,
      sub.h ? (host.y + p.center[1] * host.h - sub.y) / sub.h : 0.5,
    ];
    return { ...p, center: center.map((v) => Math.round(v * 1e4) / 1e4) as [number, number] };
  }
  if (p.kind !== "linear" || p.stops.length < 2) return p;
  // Unit direction of the gradient line (CSS: 0deg = up, clockwise) and the host line length.
  const rad = (p.angle * Math.PI) / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const length = Math.abs(host.w * dx) + Math.abs(host.h * dy);
  if (length === 0) return p;
  // Host line start = host centre − ½·length along the direction; project sub's centre ± half-extent.
  const start = (host.x + host.w / 2) * dx + (host.y + host.h / 2) * dy - length / 2;
  const subHalf = (Math.abs(sub.w * dx) + Math.abs(sub.h * dy)) / 2;
  const subMid = (sub.x + sub.w / 2) * dx + (sub.y + sub.h / 2) * dy - start;
  const t0 = (subMid - subHalf) / length, t1 = (subMid + subHalf) / length;
  if (t1 <= t0) return p;
  const stops = p.stops.map((s) => ({ color: s.color, pos: ((s.pos ?? 0) - t0) / (t1 - t0) }));
  const at = (t: number): Color => {
    if (t <= stops[0]!.pos) return stops[0]!.color;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!, b = stops[i]!;
      if (t <= b.pos) {
        const k = b.pos === a.pos ? 1 : (t - a.pos) / (b.pos - a.pos);
        const mix = (u: number, v: number) => Math.round((u + (v - u) * k) * 1e4) / 1e4;
        return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: mix(a.color.a, b.color.a) };
      }
    }
    return stops[stops.length - 1]!.color;
  };
  const cut: GradientStop[] = [{ color: at(0), pos: 0 }, ...stops.filter((s) => s.pos > 0 && s.pos < 1).map((s) => ({ color: s.color, pos: Math.round(s.pos * 1e4) / 1e4 })), { color: at(1), pos: 1 }];
  return { ...p, stops: cut };
}


/** Computed `background-image` → paints, bottom-most first. */
export function parseBackgroundImage(s: string | undefined): Paint[] {
  if (!s || s === "none") return [];
  const layers = splitTop(s, ",").reverse();
  return layers.map(parseGradient);
}


/**
 * One `background-image` layer: `[repeating-]{linear,radial,conic}-gradient(…)` or
 * `url(…)`; anything else → `unsupported`. Gradient centers given in px stay at the
 * default (50% 50%) because the box size is unknown here.
 */
function parseGradient(s: string): Paint {
  s = s.trim();
  const u = /^url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)$/s.exec(s);
  if (u) return { kind: "image", url: (u[1] ?? u[2] ?? u[3] ?? "").replace(/\\(.)/g, "$1").trim() };
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(s);
  if (!m) return { kind: "unsupported", raw: s };
  const kind = m[2]!;
  const args = splitTop(m[3]!, ",");
  let paint: Paint;
  if (kind === "linear") {
    let angle = 180; // CSS default: to bottom
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift()!;
      const deg = /^[-+]?[\d.]/.test(a) ? hue(a) : undefined;
      if (deg !== undefined) angle = deg;
      else if (/^to\s+/.test(a)) angle = sideAngle(a);
      else return { kind: "unsupported", raw: s };
    }
    paint = { kind: "linear", angle, stops: parseStops(args) };
  } else if (kind === "radial") {
    let ellipse = true;
    let center: [number, number] = [0.5, 0.5];
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift()!;
      if (/\bcircle\b/.test(a)) ellipse = false;
      center = atPosition(a) ?? center;
    }
    paint = { kind: "radial", stops: parseStops(args), center, ellipse };
  } else {
    let from = 0;
    let center: [number, number] = [0.5, 0.5];
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift()!;
      const f = /from\s+([-+\d.]+(?:deg|rad|grad|turn)?)/.exec(a);
      if (f) from = hue(f[1]!) ?? 0;
      center = atPosition(a) ?? center;
    }
    paint = { kind: "conic", stops: parseStops(args), from, center };
  }
  if (m[1]) paint.repeating = true;
  return paint;
}


/** `at <x> <y>` inside a gradient prelude → 0..1 fractions (percentages or side keywords). */
function atPosition(prelude: string): [number, number] | undefined {
  const at = /\bat\s+(\S+)(?:\s+(\S+))?\s*$/.exec(prelude);
  if (!at) return undefined;
  const x = fraction(at[1]!), y = at[2] === undefined ? 0.5 : fraction(at[2]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

export function fraction(t: string): number | undefined {
  switch (t) {
    case "left":
    case "top":
      return 0;
    case "center":
      return 0.5;
    case "right":
    case "bottom":
      return 1;
  }
  const m = /^([-+\d.]+)%$/.exec(t);
  return m ? +m[1]! / 100 : undefined;
}


export const COLOR_TOKEN = String.raw`(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]+|transparent`;


function looksLikeColor(s: string): boolean {
  return /^(rgba?\(|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|#|transparent$)/.test(s.trim());
}


function sideAngle(a: string): number {
  const t = a.replace(/^to\s+/, "").trim();
  const map: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270, "top right": 45, "right top": 45, "bottom right": 135, "right bottom": 135, "bottom left": 225, "left bottom": 225, "top left": 315, "left top": 315 };
  return map[t] ?? 180;
}


function parseStops(args: string[]): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const a of args) {
    const m = new RegExp(String.raw`^(${COLOR_TOKEN})\s*(?:([-+\d.]+)(%|px|deg))?\s*$`, "i").exec(a);
    if (!m) continue;
    const color = parseColor(m[1]!) ?? TRANSPARENT;
    const stop: GradientStop = { color };
    if (m[2] !== undefined && m[3] === "%") stop.pos = +m[2] / 100;
    else if (m[2] !== undefined && m[3] === "deg") stop.pos = +m[2] / 360;
    else if (m[2] !== undefined && m[3] === "px") stop.px = +m[2];
    stops.push(stop);
  }
  // px stops need the box; `resolvePaint` finishes them.
  if (!stops.some((s) => s.px !== undefined)) fillEvenly(stops);
  return stops;
}


/** Fill in undefined positions evenly (CSS rule, simplified: first 0, last 1, linear between). */
function fillEvenly(stops: GradientStop[]): void {
  if (!stops.length) return;
  if (stops[0]!.pos === undefined) stops[0]!.pos = 0;
  if (stops[stops.length - 1]!.pos === undefined) stops[stops.length - 1]!.pos = 1;
  let i = 0;
  while (i < stops.length) {
    if (stops[i]!.pos !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (stops[j]!.pos === undefined) j++;
    const p0 = stops[i - 1]!.pos!;
    const p1 = stops[j]!.pos!;
    for (let k = i; k < j; k++) stops[k]!.pos = p0 + ((p1 - p0) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
}


/**
 * Resolve a gradient's px stops against the box it paints: linear stops divide by the
 * gradient-line length (`|w·sin θ| + |h·cos θ|`), radial stops by the farthest-corner
 * distance from the center. Non-repeating stops clamp to 0..1; repeating ones keep their
 * period so the consumer can tile. Paints without px stops are returned as-is.
 */
export function resolvePaint(p: Paint, w: number, h: number): Paint {
  if (p.kind !== "linear" && p.kind !== "radial") return p;
  if (!p.stops.some((s) => s.px !== undefined)) return p;
  let length: number;
  if (p.kind === "linear") {
    const rad = (p.angle * Math.PI) / 180;
    length = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  } else {
    const cx = p.center[0] * w, cy = p.center[1] * h;
    length = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  }
  const stops = p.stops.map(({ color, pos, px }) => {
    const stop: GradientStop = { color };
    if (px !== undefined && length > 0) pos = px / length;
    if (pos !== undefined) stop.pos = Math.round((p.repeating ? pos : Math.min(1, Math.max(0, pos))) * 1e4) / 1e4;
    return stop;
  });
  fillEvenly(stops);
  return { ...p, stops };
}
