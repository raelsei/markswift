/** Pure paint interpretation of browser-resolved CSS values. */
import { type Color, hue } from "./color.ts";
import { type BlendMode } from "./blend.ts";
import { type BackgroundSize, type BackgroundRepeat } from "./background.ts";
import { splitTop } from "./syntax.ts";
import { linearGradientLine, type GradientCorner } from "./gradient-line.ts";
import { gradientInterpolation } from "./gradient-interpolation.ts";
import { parseRadialPrelude, radialGeometry, type RadialGeometrySpec } from "./radial-gradient.ts";


import { authoredStopPositions, parseGradientStops, resolveStopPositions, type GradientStop, type GradientStopPosition } from "./gradient-stops.ts";
export { COLOR_TOKEN, type GradientStop, type GradientStopPosition } from "./gradient-stops.ts";


/** Px from the node's border-box edge to a fill's painting area (top, right, bottom, left). */
export type PaintInset = {
  inset?: [number, number, number, number];
  /** `background-blend-mode` for this layer, against the layers below it. Absent = `normal`. */
  blend?: BlendMode;
};

/** Absence preserves legacy encoded-sRGB interpolation. */
type GradientInterpolation = { interpolation?: "oklab"; stopPositions?: GradientStopPosition[] };


/**
 * One `background-image` layer (or a solid `background-color`). Gradient variants carry
 * `repeating: true` for `repeating-*-gradient`; `center` is a 0..1 fraction of the box.
 * Image layers carry the resolved `background-size`/`position`/`repeat` (px, box-relative)
 * when the producer knows the box; absent = fill the box. `inset` (any fill) is set for
 * `background-clip: padding-box | content-box`.
 */
export type Paint =
  | ({ kind: "solid"; color: Color } & PaintInset)
  | ({ kind: "linear"; angle: number; corner?: GradientCorner; stops: GradientStop[]; repeating?: true } & PaintInset & GradientInterpolation)
  | ({ kind: "radial"; stops: GradientStop[]; repeating?: true } & RadialGeometrySpec & PaintInset & GradientInterpolation)
  | ({ kind: "conic"; stops: GradientStop[]; from: number; center: [number, number]; repeating?: true } & PaintInset & GradientInterpolation)
  | ({ kind: "image"; url: string; size?: BackgroundSize; position?: [number, number]; repeat?: BackgroundRepeat } & PaintInset)
  | { kind: "unsupported"; raw: string; reason?: string };


/**
 * Re-express a gradient painted over `host` so that the same colours land on `sub` (both
 * boxes in one coordinate space): linear stops are projected onto `sub`'s span of the
 * gradient line and cut to 0..1; radial/conic centers move. Used for `background-clip:
 * text`, where the browser paints across the block but the glyph run is what gets filled.
 */
export function paintWithin(p: Paint, host: { x: number; y: number; w: number; h: number }, sub: { x: number; y: number; w: number; h: number }): Paint {
  if (p.kind === "radial") {
    const geometry = radialGeometry(p, host.w, host.h);
    const point: [number, number] = [host.x + geometry.center[0] - sub.x, host.y + geometry.center[1] - sub.y];
    return { ...p,
      center: [sub.w ? point[0] / sub.w : 0.5, sub.h ? point[1] / sub.h : 0.5],
      position: point.map(value => ({ value, unit: "px" })) as NonNullable<typeof p.position>,
      size: geometry.radii.map(value => ({ value, unit: "px" })) as Exclude<typeof p.size, string | undefined>,
    };
  }
  if (p.kind === "conic") {
    const center: [number, number] = [
      sub.w ? (host.x + p.center[0] * host.w - sub.x) / sub.w : 0.5,
      sub.h ? (host.y + p.center[1] * host.h - sub.y) / sub.h : 0.5,
    ];
    return { ...p, center: center.map((v) => Math.round(v * 1e4) / 1e4) as [number, number] };
  }
  if (p.kind !== "linear" || p.stops.length < 2) return p;
  // Unit direction of the gradient line (CSS: 0deg = up, clockwise) and the host line length.
  const { direction: [dx, dy], length } = linearGradientLine(p.angle, host.w, host.h, p.corner);
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
  const { stopPositions: _positions, ...cropped } = p;
  if (!p.corner) return { ...cropped, stops: cut };
  // The sub-paint keeps the host's physical direction; its different aspect must not
  // reinterpret the host's corner keyword as a new direction.
  const { corner: _, ...numeric } = cropped;
  return { ...numeric, angle: Math.atan2(dx, -dy) * 180 / Math.PI, stops: cut };
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
export function parseGradient(s: string): Paint {
  s = s.trim();
  const u = /^url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)$/s.exec(s);
  if (u) return { kind: "image", url: (u[1] ?? u[2] ?? u[3] ?? "").replace(/\\(.)/g, "$1").trim() };
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(s);
  if (!m) return { kind: "unsupported", raw: s };
  const kind = m[2]!;
  const interpolation = gradientInterpolation(splitTop(m[3]!, ","));
  if (!interpolation) return { kind: "unsupported", raw: s };
  const args = interpolation.args;
  let paint: Paint;
  if (kind === "linear") {
    let angle = 180; // CSS default: to bottom
    let corner: GradientCorner | undefined;
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift()!;
      const deg = /^[-+]?[\d.]/.test(a) ? hue(a) : undefined;
      if (deg !== undefined) angle = deg;
      else if (/^to\s+/.test(a)) {
        angle = sideAngle(a);
        if (/\b(left|right)\b/.test(a) && /\b(top|bottom)\b/.test(a)) {
          corner = [/\bright\b/.test(a) ? 1 : -1, /\bbottom\b/.test(a) ? 1 : -1];
        }
      }
      else return { kind: "unsupported", raw: s };
    }
    const stops = parseGradientStops(args, "linear");
    if (!stops) return { kind: "unsupported", raw: s, reason: "unresolved gradient color stops or transition hints" };
    paint = { kind: "linear", angle, stops };
    if (corner) paint.corner = corner;
  } else if (kind === "radial") {
    let geometry: RadialGeometrySpec = { ellipse: true, center: [0.5, 0.5] };
    if (args[0] && !looksLikeColor(args[0])) {
      const parsed = parseRadialPrelude(args.shift()!);
      if (!parsed) return { kind: "unsupported", raw: s };
      geometry = parsed;
    }
    const stops = parseGradientStops(args, "radial");
    if (!stops) return { kind: "unsupported", raw: s, reason: "unresolved gradient color stops or transition hints" };
    paint = { kind: "radial", stops, ...geometry };
  } else {
    let from = 0;
    let center: [number, number] = [0.5, 0.5];
    if (args[0] && !looksLikeColor(args[0])) {
      const a = args.shift()!;
      const f = /from\s+([-+\d.]+(?:deg|rad|grad|turn)?)/.exec(a);
      if (f) from = hue(f[1]!) ?? 0;
      center = atPosition(a) ?? center;
    }
    const stops = parseGradientStops(args, "conic");
    if (!stops) return { kind: "unsupported", raw: s, reason: "unresolved gradient color stops or transition hints" };
    paint = { kind: "conic", stops, from, center };
  }
  if (m[1]) paint.repeating = true;
  if (paint.stops.some(stop => stop.px !== undefined)) paint.stopPositions = authoredStopPositions(paint.stops);
  if (interpolation.oklab) paint.interpolation = "oklab";
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


function looksLikeColor(s: string): boolean {
  return /^(rgba?\(|hsla?\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|#|transparent(?:\s|$))/i.test(s.trim());
}


function sideAngle(a: string): number {
  const t = a.replace(/^to\s+/, "").trim();
  const map: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270, "top right": 45, "right top": 45, "bottom right": 135, "right bottom": 135, "bottom left": 225, "left bottom": 225, "top left": 315, "left top": 315 };
  return map[t] ?? 180;
}


/**
 * Resolve a gradient's px stops against the box it paints: linear stops divide by the
 * gradient-line length, radial stops by the ending shape's horizontal radius.
 * Positions outside 0..1 remain on the infinite gradient line. Authored units and
 * omissions remain available for a subsequent resolution against another box.
 */
export function resolvePaint(p: Paint, w: number, h: number): Paint {
  if (p.kind !== "linear" && p.kind !== "radial") return p;
  if (!p.stopPositions && !p.stops.some((s) => s.px !== undefined)) return p;
  let length: number;
  if (p.kind === "linear") {
    length = linearGradientLine(p.angle, w, h, p.corner).length;
  } else {
    length = radialGeometry(p, w, h).radii[0];
  }
  const stopPositions = p.stopPositions ?? authoredStopPositions(p.stops);
  const positions = resolveStopPositions(stopPositions, length);
  if (!positions || positions.length !== p.stops.length) return { kind: "unsupported", raw: "gradient", reason: "unresolved gradient stop positions" };
  const stops = p.stops.map(({ color }, index) => ({ color, pos: Math.round(positions[index]! * 1e4) / 1e4 }));
  return { ...p, stops, stopPositions };
}
