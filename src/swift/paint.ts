import { parseBlendMode, type BlendMode, type Color, type Paint } from "../css/index.ts";
import type { Style, SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, indent, num, type ColorCtx } from "./format.ts";
import { imageLayer } from "./images.ts";
import { linearGradientLine } from "../css/gradient-line.ts";
import { radialGeometry } from "../css/radial-gradient.ts";
import { radialGradientArguments } from "./paint-radial.ts";
import { backgroundClip } from "./paint-clip.ts";
import { gradientStopArguments, radialStyleStops } from "./paint-stops.ts";
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
      const { start: [sx, sy], end: [ex, ey] } = linearGradientLine(p.angle, w, h, p.corner);
      return `LinearGradient.linearGradient(Gradient(stops: ${stops(p, ctx, id)}).colorSpace(${gradientSpace(p)}), startPoint: UnitPoint(x: ${num(sx)}, y: ${num(sy)}), endPoint: UnitPoint(x: ${num(ex)}, y: ${num(ey)}))`;
    }
    case "radial": {
      const geometry = radialGeometry(p, w, h);
      const [cx, cy] = geometry.center;
      const extended = radialStyleStops(p);
      return `RadialGradient.radialGradient(Gradient(stops: ${stops({ ...p, stops: extended.stops }, ctx, id)}).colorSpace(${gradientSpace(p)}), center: UnitPoint(x: ${num(w ? cx / w : 0.5)}, y: ${num(h ? cy / h : 0.5)}), startRadius: 0, endRadius: ${num(geometry.radii[0] * extended.scale)})`;
    }
    case "conic":
      return `AngularGradient.angularGradient(Gradient(stops: ${stops(p, ctx, id)}).colorSpace(${gradientSpace(p)}), center: UnitPoint(x: ${num(p.center[0])}, y: ${num(p.center[1])}), startAngle: .degrees(${num(p.from - 90)}), endAngle: .degrees(${num(p.from + 270)}))`;
    default:
      return "Color.clear";
  }
}

/** Decorative linear paint is a View so its direction follows live bounds in either mode. */
export function linearGradientViewExpr(p: Extract<Paint, { kind: "linear" }>, ctx: ColorCtx, id?: string): string {
  const corner = p.corner ? `, corner: UnitPoint(x: ${num((p.corner[0] + 1) / 2)}, y: ${num((p.corner[1] + 1) / 2)})` : "";
  const interpolation = p.interpolation === "oklab" ? ", perceptual: true" : "";
  return `MarkswiftCSSLinearGradient(stops: ${stops(p, ctx, id)}${gradientStopArguments(p)}, angle: ${num(p.angle)}${corner}${interpolation})`;
}

export function radialGradientViewExpr(p: Extract<Paint, { kind: "radial" }>, ctx: ColorCtx, id?: string): string {
  const interpolation = p.interpolation === "oklab" ? ", perceptual: true" : "";
  return `MarkswiftCSSRadialGradient(stops: ${stops(p, ctx, id)}${gradientStopArguments(p)}, ${radialGradientArguments(p)}${interpolation})`;
}

function gradientSpace(p: Gradient): string { return p.interpolation === "oklab" ? ".perceptual" : ".device"; }

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
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(EdgeInsets(top: ${num(p.inset[0])}, leading: ${num(p.inset[3])}, bottom: ${num(p.inset[2])}, trailing: ${num(p.inset[1])}))` : "";
  if (p.kind === "linear") return [`.background { ${linearGradientViewExpr(p, ctx, n.id)}${backgroundClip(p, n, shape, inset)} }`];
  if (p.kind === "radial") return [`.background { ${radialGradientViewExpr(p, ctx, n.id)}${backgroundClip(p, n, shape, inset)} }`];
  if (p.kind === "conic") return [`.background { Rectangle().fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})${backgroundClip(p, n, shape, inset)} }`];
  if (p.kind !== "image") {
    const paint = paintExpr(p, n.frame.w, n.frame.h, ctx, n.id);
    return inset ? [`.background { Rectangle().fill(${paint})${backgroundClip(p, n, shape, inset)} }`] : [`.background(${paint}, in: ${shape})`];
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

export function swiftBlend(css: string): string | undefined {
  const mode = parseBlendMode(css);
  return mode ? SWIFT_BLEND[mode] : undefined;
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
  const inset = p.kind !== "unsupported" && p.inset?.some((v) => v !== 0) ? `.padding(EdgeInsets(top: ${num(p.inset[0])}, leading: ${num(p.inset[3])}, bottom: ${num(p.inset[2])}, trailing: ${num(p.inset[1])}))` : "";
  if (p.kind === "unsupported") return [];
  if (p.kind === "linear") return [`${linearGradientViewExpr(p, ctx, n.id)}${backgroundClip(p, n, shape, inset)}`];
  if (p.kind === "radial") return [`${radialGradientViewExpr(p, ctx, n.id)}${backgroundClip(p, n, shape, inset)}`];
  if (p.kind === "conic") return [`Rectangle().fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})${backgroundClip(p, n, shape, inset)}`];
  if (p.kind !== "image") return inset
    ? [`Rectangle().fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})${backgroundClip(p, n, shape, inset)}`]
    : [`${shape}.fill(${paintExpr(p, n.frame.w, n.frame.h, ctx, n.id)})`];
  const layer = imageLayer(p, n, "background-image", ctx);
  return layer ? [...layer, `.clipShape(${shape})${inset}`] : [];
}
