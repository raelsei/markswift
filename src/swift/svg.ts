/**
 * SvgNode → SwiftUI: one `Shape` struct per unique (path, viewBox), layered fills/strokes
 * in a ZStack (gradients, dash arrays, clips and masks are per-layer modifiers); progress
 * rings become trimmed `Circle`s; `<text>` runs are `Text`s positioned where the browser
 * laid them out.
 */
import svgpath from "svgpath";
import type { SvgGradient, SvgNode, SvgPath, SvgText } from "../model/semantic.ts";
import type { ColorCtx } from "./context.ts";
import { colorExpr, fontExpr, hash, indent, num, shapeStruct, str } from "./format.ts";

/** Viewport mapping shared by every layer of one svg: viewBox, uniform scale, content offset. */
interface View {
  vb: [number, number, number, number];
  scale: number;
  /** Content box (uniform `meet` fit) top-left inside the node frame, px. */
  offset: [number, number];
  shapes: Record<string, string>;
  /** Where a colour becomes a token reference; see `colorExpr`. */
  ctx: ColorCtx;
  /** The node whose colours these are; unset when the extractor never enumerated them. */
  id?: string;
}

/**
 * Expression lines for an SVG node; registers any new Shape structs in `shapes` (name → source).
 * `id` is the node the colours belong to, for the token lookup: an `<svg>` node of the IR. An
 * SVG inlined through an `<img>` has no enumerated colours, so it passes none and stays literal.
 */
export function svgExpr(n: SvgNode, shapes: Record<string, string>, ctx: ColorCtx, id?: string): string[] {
  const [, , vw, vh] = n.viewBox;
  // preserveAspectRatio default (`xMidYMid meet`): uniform scale, content centred in the frame.
  const scale = vw > 0 && vh > 0 ? (n.stretch ? n.frame.w / vw : Math.min(n.frame.w / vw, n.frame.h / vh)) : 1;
  const cw = n.stretch ? n.frame.w : vw * scale, ch = n.stretch ? n.frame.h : vh * scale;
  const view: View = { vb: n.viewBox, scale, offset: [(n.frame.w - cw) / 2, (n.frame.h - ch) / 2], shapes, ctx, id };
  const layers = n.paths.flatMap((p) => layerLines(p, view));
  for (const t of n.texts ?? []) layers.push(textLine(t, view));
  const out = layers.length === 0 ? ["Color.clear"] : layers.length === 1 ? [layers[0]!] : ["ZStack {", ...indent(layers, 1), "}"];
  if (Math.abs(cw - n.frame.w) > 0.01 || Math.abs(ch - n.frame.h) > 0.01) out.push(`.frame(width: ${num(cw)}, height: ${num(ch)})`);
  // An `aria-label` (emitted by `placementModifiers`) wins over `<title>`.
  if (n.label && !n.a11y?.label) out.push(`.accessibilityLabel(${str(n.label)})`);
  return out;
}

/** Fill and stroke layers of one path (each a single line). */
function layerLines(p: SvgPath, view: View): string[] {
  const { scale, vb } = view;
  const [, , vw] = vb;
  if (p.ring) {
    // Progress ring: circle with dash array → trimmed Circle rotated to the baked start angle.
    const inset = (vw / 2 - p.ring.r) * scale;
    const lw = (p.strokeWidth ?? 1) * scale;
    // The stroke's view is the padded square, so gradient coordinates map through the circle's box.
    const box: [number, number, number, number] = [vb[0] + vw / 2 - p.ring.r, vb[1] + vb[3] / 2 - p.ring.r, 2 * p.ring.r, 2 * p.ring.r];
    const paint = p.strokeGradient ? gradientExpr(p.strokeGradient, box, view) : colorExpr(p.stroke ?? { r: 0, g: 0, b: 0, a: 1 }, view.ctx, view.id);
    const rotate = p.ring.startAngle ? `.rotationEffect(.degrees(${Number.isInteger(p.ring.startAngle) ? p.ring.startAngle : num(p.ring.startAngle)}))` : "";
    return [`Circle().trim(from: 0, to: ${num(p.ring.to)}).stroke(${withOpacity(paint, p.strokeOpacity)}, style: StrokeStyle(lineWidth: ${num(lw)}, lineCap: .${p.lineCap ?? "butt"}))${rotate}.padding(${num(inset)})`];
  }
  const name = shapeName(p.d, vb, view.shapes);
  const suffix = layerSuffix(p, view);
  const out: string[] = [];
  const fill = p.gradient ? gradientExpr(p.gradient, vb, view) : p.fill && p.fill.a > 0 ? colorExpr(p.fill, view.ctx, view.id) : undefined;
  if (fill) out.push(`${name}().fill(${withOpacity(fill, p.fillOpacity)}${p.eoFill ? ", style: FillStyle(eoFill: true)" : ""})${suffix}`);
  const stroke = p.strokeGradient ? gradientExpr(p.strokeGradient, vb, view) : p.stroke && p.stroke.a > 0 ? colorExpr(p.stroke, view.ctx, view.id) : undefined;
  if (stroke) {
    const lw = (p.strokeWidth ?? 1) * scale;
    let style = `lineWidth: ${num(lw)}, lineCap: .${p.lineCap ?? "butt"}, lineJoin: .${p.lineJoin ?? "miter"}`;
    if (p.miterLimit !== undefined) style += `, miterLimit: ${num(p.miterLimit)}`;
    if (p.dash?.length) style += `, dash: [${p.dash.map((v) => num(v * scale)).join(", ")}]${p.dashPhase ? `, dashPhase: ${num(p.dashPhase * scale)}` : ""}`;
    out.push(`${name}().stroke(${withOpacity(stroke, p.strokeOpacity)}, style: StrokeStyle(${style}))${suffix}`);
  }
  return out;
}

/** Modifiers shared by a path's fill and stroke layers: opacity, clip, mask. */
function layerSuffix(p: SvgPath, view: View): string {
  let s = p.opacity !== undefined ? `.opacity(${num(p.opacity)})` : "";
  if (p.clip) s += `.clipShape(${shapeName(p.clip.d, view.vb, view.shapes)}()${p.clip.eoFill ? ", style: FillStyle(eoFill: true)" : ""})`;
  if (p.mask?.length) {
    // SVG masks are luminance masks; SwiftUI masks by alpha.
    const layers = p.mask.flatMap((m) => layerLines(m, view));
    const content = layers.length === 1 ? layers[0]! : `ZStack { ${layers.join("; ")} }`;
    s += `.mask { ${content}.luminanceToAlpha() }`;
  }
  return s;
}

function withOpacity(paint: string, opacity: number | undefined): string {
  return opacity === undefined ? paint : `${paint}.opacity(${num(opacity)})`;
}

/** Gradient in user units → SwiftUI gradient relative to `box` (the view the style fills, user units). */
function gradientExpr(g: SvgGradient, box: [number, number, number, number], view: View): string {
  const { scale } = view;
  const [bx, by, bw, bh] = box;
  const unit = ([x, y]: [number, number]) => `UnitPoint(x: ${num(bw ? (x - bx) / bw : 0.5)}, y: ${num(bh ? (y - by) / bh : 0.5)})`;
  const stops = "[" + g.stops.map((s) => `.init(color: ${colorExpr(s.color, view.ctx, view.id)}, location: ${num(s.pos)})`).join(", ") + "]";
  if (g.kind === "linear") return `LinearGradient(stops: ${stops}, startPoint: ${unit(g.start)}, endPoint: ${unit(g.end)})`;
  const [rx, ry] = g.radius;
  // An ellipse proportional to the box is a single radius fraction; otherwise a circle of the mean radius.
  if (bw && bh && Math.abs(rx / bw - ry / bh) < 0.005 && Math.abs(rx - ry) > 0.01) {
    return `EllipticalGradient(stops: ${stops}, center: ${unit(g.center)}, startRadiusFraction: 0, endRadiusFraction: ${num(rx / bw)})`;
  }
  return `RadialGradient(stops: ${stops}, center: ${unit(g.center)}, startRadius: 0, endRadius: ${num(((rx + ry) / 2) * scale)})`;
}

/** A text run as a `Text` centred on its measured box (frame px → content box px). */
function textLine(t: SvgText, view: View): string {
  const font = { ...t.font, size: t.font.size * view.scale };
  const cx = t.box.x + t.box.w / 2 - view.offset[0], cy = t.box.y + t.box.h / 2 - view.offset[1];
  return `Text(verbatim: ${str(t.text)}).font(${fontExpr(font, view.ctx, true)}).foregroundStyle(${colorExpr(t.fill, view.ctx, view.id)}).fixedSize().position(x: ${num(cx)}, y: ${num(cy)})`;
}

/** One Shape struct per unique (path, viewBox); returns its name. */
function shapeName(d: string, vb: [number, number, number, number], shapes: Record<string, string>): string {
  return shapeStruct("MarkswiftShape_" + hash(`${vb.join(" ")}|${d}`), shapes, () => {
    const [vx, vy, vw, vh] = vb;
    const out = [
      `let sx = rect.width / ${num(vw)}, sy = rect.height / ${num(vh)}`,
      `func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + (x - ${num(vx)}) * sx, y: rect.minY + (y - ${num(vy)}) * sy) }`,
      "var p = Path()",
    ];
    svgpath(d).unshort().unarc().abs().iterate((seg: Array<string | number>) => {
      const [cmd, ...a] = seg as [string, ...number[]];
      switch (cmd) {
        case "M":
          out.push(`p.move(to: P(${num(a[0]!)}, ${num(a[1]!)}))`);
          break;
        case "L":
          out.push(`p.addLine(to: P(${num(a[0]!)}, ${num(a[1]!)}))`);
          break;
        case "H":
          out.push(`p.addLine(to: CGPoint(x: P(${num(a[0]!)}, 0).x, y: p.currentPoint?.y ?? 0))`);
          break;
        case "V":
          out.push(`p.addLine(to: CGPoint(x: p.currentPoint?.x ?? 0, y: P(0, ${num(a[0]!)}).y))`);
          break;
        case "C":
          out.push(`p.addCurve(to: P(${num(a[4]!)}, ${num(a[5]!)}), control1: P(${num(a[0]!)}, ${num(a[1]!)}), control2: P(${num(a[2]!)}, ${num(a[3]!)}))`);
          break;
        case "Q":
          out.push(`p.addQuadCurve(to: P(${num(a[2]!)}, ${num(a[3]!)}), control: P(${num(a[0]!)}, ${num(a[1]!)}))`);
          break;
        case "Z":
          out.push("p.closeSubpath()");
          break;
      }
    });
    out.push("return p");
    return out;
  });
}
