import type { BlendMode, Color, Paint } from "../model/values.ts";
import type { Style, SemNode } from "../model/semantic.ts";
import type { ColorCtx, EmitContext } from "./context.ts";
import { colorExpr, edgeInsets, indent, num } from "./format.ts";
import { imageLayer } from "./images.ts";
export function shapeExpr(st: Style, w: number, h: number): string {
  if (st.ellipse) return "Ellipse()";
  const r = st.radius;
  if (!r || r.every((v) => v === 0)) return "Rectangle()";
  const allSame = r.every((v) => Math.abs(v - r[0]) < 0.01);
  if (allSame) {
    if (r[0] >= Math.min(w, h) / 2 - 0.01) return Math.abs(w - h) < 0.01 ? "Circle()" : "Capsule(style: .circular)";
    return `RoundedRectangle(cornerRadius: ${num(r[0])}, style: .circular)`;
  }
  return `UnevenRoundedRectangle(topLeadingRadius: ${num(r[0])}, bottomLeadingRadius: ${num(r[3])}, bottomTrailingRadius: ${num(r[2])}, topTrailingRadius: ${num(r[1])}, style: .circular)`;
}

/** A CSS paint as a SwiftUI style. `ctx`/`id` resolve its colours; see `colorExpr`. */
export function paintExpr(p: Paint, w: number, h: number, ctx: ColorCtx, id?: string): string {
  switch (p.kind) {
    case "solid":
      return colorExpr(p.color, ctx, id);
    case "linear": {
      const rad = (p.angle * Math.PI) / 180, sin = Math.sin(rad), cos = Math.cos(rad);
      // CSS gradient line: through the centre, length |w·sinθ| + |h·cosθ|.
      const half = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
      const dx = w > 0 ? (half * sin) / w : 0.5 * sin, dy = h > 0 ? (half * cos) / h : 0.5 * cos;
      const sx = 0.5 - dx, sy = 0.5 + dy, ex = 0.5 + dx, ey = 0.5 - dy;
      return `LinearGradient(stops: ${stops(p, ctx, id)}, startPoint: UnitPoint(x: ${num(sx)}, y: ${num(sy)}), endPoint: UnitPoint(x: ${num(ex)}, y: ${num(ey)}))`;
    }
    case "radial": {
      const [cx, cy] = p.center;
      const fx = Math.max(cx, 1 - cx) * w, fy = Math.max(cy, 1 - cy) * h;
      const R = p.ellipse ? Math.hypot(fx, fy) : Math.hypot(fx, fy);
      return `RadialGradient(stops: ${stops(p, ctx, id)}, center: UnitPoint(x: ${num(cx)}, y: ${num(cy)}), startRadius: 0, endRadius: ${num(R)})`;
    }
    case "conic":
      return `AngularGradient(stops: ${stops(p, ctx, id)}, center: UnitPoint(x: ${num(p.center[0])}, y: ${num(p.center[1])}), startAngle: .degrees(${num(p.from - 90)}), endAngle: .degrees(${num(p.from + 270)}))`;
    default:
      return "Color.clear";
  }
}

type Gradient = Extract<Paint, { stops: unknown }>;

/**
 * Gradient stop list. A `repeating-*` gradient's stops cover one period (0 … last stop, as
 * fractions of the gradient line); SwiftUI has no repeat mode, so the period is tiled up to 1.
 */
function stops(p: Gradient, ctx: ColorCtx, id?: string): string {
  let s: Array<{ color: Color; pos?: number }> = p.stops;
  const period = s[s.length - 1]?.pos ?? 0;
  if (p.repeating && period > 0 && period < 1) {
    const tiled: typeof s = [];
    for (let k = 0; k * period < 1 - 1e-6 && tiled.length < 400; k++) for (const x of s) tiled.push({ color: x.color, pos: Math.min(1, (x.pos ?? 0) + k * period) });
    s = tiled;
  }
  return "[" + s.map((x) => `.init(color: ${colorExpr(x.color, ctx, id)}, location: ${num(x.pos ?? 0)})`).join(", ") + "]";
}

/**
 * One background layer: shape styles go through `.background(_:in:)`, images through a clipped
 * view. `background-clip: padding-box | content-box` (`Paint.inset`) pads the painted shape
 * inside the box; the corner radius shrinks with it, close to how Chrome insets the corners.
 */
export function fillModifier(p: Paint, n: SemNode, shape: string, ctx: EmitContext): string[] {
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(${edgeInsets(p.inset)})` : "";
  if (p.kind !== "image") {
    const paint = paintExpr(p, n.frame.w, n.frame.h, ctx, n.id);
    return inset ? [`.background { ${shape}.fill(${paint})${inset} }`] : [`.background(${paint}, in: ${shape})`];
  }
  const layer = imageLayer(p, n, "background-image", ctx);
  return layer ? [".background {", ...indent([...layer, `.clipShape(${shape})${inset}`], 1), "}"] : [];
}

/**
 * CSS `<blend-mode>` → SwiftUI `BlendMode`. Both sides are the PDF blend model: the separable
 * functions (`multiply` … `luminosity`) and the non-separable ones (`hue`, `saturation`,
 * `color`, `luminosity`) are the same formulas in the CSS compositing spec and in
 * CoreGraphics, and `plus-lighter`/`plus-darker` are the same clamped additive composites, so
 * the whole keyword set maps by name. `normal` needs no modifier at all.
 */
const SWIFT_BLEND: Record<BlendMode, string | undefined> = {
  normal: undefined,
  multiply: ".multiply",
  screen: ".screen",
  overlay: ".overlay",
  darken: ".darken",
  lighten: ".lighten",
  "color-dodge": ".colorDodge",
  "color-burn": ".colorBurn",
  "hard-light": ".hardLight",
  "soft-light": ".softLight",
  difference: ".difference",
  exclusion: ".exclusion",
  hue: ".hue",
  saturation: ".saturation",
  color: ".color",
  luminosity: ".luminosity",
  "plus-lighter": ".plusLighter",
  "plus-darker": ".plusDarker",
};

export function swiftBlend(mode: BlendMode): string | undefined {
  return SWIFT_BLEND[mode];
}

/**
 * Background layers where at least one carries a `background-blend-mode`. A chain of
 * `.background` modifiers gives each layer its own compositing group, so a blend would reach
 * past the sibling layers to whatever is behind the node; CSS blends strictly within the
 * node's own background. One `ZStack` (bottom-most first, as the IR stores them) inside a
 * single `.background`, with the blend on the upper layer and a `.compositingGroup()` around
 * the result, is that scope exactly.
 */
export function blendedFillModifier(fills: Paint[], n: SemNode, shape: string, ctx: EmitContext): string[] {
  const layers: string[] = [];
  for (const p of fills) {
    const inner = fillLayerView(p, n, shape, ctx);
    if (!inner.length) continue;
    const blend = p.kind !== "unsupported" && p.blend ? swiftBlend(p.blend) : undefined;
    layers.push(...(blend ? [...inner, `.blendMode(${blend})`] : inner));
  }
  if (!layers.length) return [];
  return [".background {", ...indent(["ZStack(alignment: .topLeading) {", ...indent(layers, 1), "}", ".compositingGroup()"], 1), "}"];
}

/** One background layer as a stand-alone view (the `.background` content of `fillModifier`). */
function fillLayerView(p: Paint, n: SemNode, shape: string, ctx: EmitContext): string[] {
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(${edgeInsets(p.inset)})` : "";
  if (p.kind === "unsupported") return [];
  if (p.kind !== "image") return [`${shape}.fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})${inset}`];
  const layer = imageLayer(p, n, "background-image", ctx);
  return layer ? [...layer, `.clipShape(${shape})${inset}`] : [];
}
