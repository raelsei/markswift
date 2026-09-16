/** Traverse SVG groups, instances and shapes with recursive clipping and masks. */
import { type LayoutNode, type Rect } from "../../model/layout.ts";
import { type SvgPath } from "../../model/semantic.ts";
import { parseColor, round2, px } from "../../css/index.ts";
import { type SvgScope, type SvgContext, type SvgMatrix } from "./context.ts";
import { IDENTITY, multiply, ownTransform, bake } from "./transforms.ts";
import { inherit, num, styleProp, parseDash, reference } from "./attributes.ts";
import { collectText } from "./text.ts";
import { pathBounds, ringOf } from "./geometry.ts";
import { gradientOf } from "./gradients.ts";

const SVG_SHAPE_TAGS: Record<string, true> = { path: true, circle: true, rect: true, line: true, polyline: true, polygon: true, ellipse: true };

/** Containers whose children are drawn in place. */
const GROUP_TAGS: Record<string, true> = { g: true, svg: true, a: true };

function childScope(c: LayoutNode, scope: SvgScope, ctx: SvgContext, extra: SvgMatrix = IDENTITY): SvgScope {
  const own = parseFloat(c.attrs["opacity"] ?? "1");
  return {
    attrs: inherit(scope.attrs, c.attrs),
    ctm: multiply(multiply(scope.ctm, extra), ownTransform(c, ctx.notes)),
    opacity: scope.opacity * (Number.isFinite(own) ? own : 1),
    useColor: scope.useColor,
    depth: scope.depth,
  };
}

export function visitChildren(el: LayoutNode, scope: SvgScope, ctx: SvgContext): void {
  for (const c of el.children) visitOne(c, scope, ctx);
}

function visitOne(c: LayoutNode, scope: SvgScope, ctx: SvgContext): void {
  if (SVG_SHAPE_TAGS[c.tag]) {
    const p = shapeToPath(c, childScope(c, scope, ctx), ctx, true);
    if (p) ctx.paths.push(p);
  } else if (c.tag === "switch") {
    // The browser already evaluated the conditional attributes: only the chosen child has a box.
    const inner = childScope(c, scope, ctx);
    for (const k of c.children) if (k.bounds.w > 0 || k.bounds.h > 0) visitOne(k, inner, ctx);
  } else if (GROUP_TAGS[c.tag]) {
    if (c.tag === "a") ctx.notes.push("approximated: svg <a> link → shapes only");
    visitChildren(c, childScope(c, scope, ctx), ctx);
  } else if (c.tag === "use") instantiate(c, scope, ctx);
  else if (c.tag === "text") collectText(c, childScope(c, scope, ctx), { x: 0, y: 0 }, ctx);
  else if (c.tag === "image") ctx.notes.push("unmapped: svg image");
}

/** `<use href="#id">`: draw the target (symbol, group or shape) translated by x/y, sized like a nested viewport for symbols. */
function instantiate(c: LayoutNode, scope: SvgScope, ctx: SvgContext): void {
  const href = c.attrs["href"] ?? c.attrs["xlink:href"] ?? "";
  if (!href.startsWith("#")) {
    ctx.notes.push(`unmapped: svg use ${href || "(no href)"}`);
    return;
  }
  const target = ctx.ids[href.slice(1)];
  if (!target) {
    ctx.notes.push(`unmapped: svg use ${href} (target not in document)`);
    return;
  }
  if (scope.depth > 8) return;
  const x = num(c.attrs["x"]), y = num(c.attrs["y"]);
  const inner = childScope(c, scope, ctx);
  inner.ctm = multiply(inner.ctm, [1, 0, 0, 1, x, y]);
  inner.useColor = c.styles["color"] ?? scope.useColor;
  inner.depth = scope.depth + 1;
  if (target.tag === "symbol" || target.tag === "svg") {
    // A symbol instance is a nested viewport: use/symbol width+height (default 100% of ours) with the symbol's viewBox fitted `meet`, centred.
    const [, , vw, vh] = ctx.vb;
    const w = num(c.attrs["width"] ?? target.attrs["width"], vw), h = num(c.attrs["height"] ?? target.attrs["height"], vh);
    const svb = target.attrs["viewbox"]?.split(/[\s,]+/).map(Number);
    if (svb && svb.length === 4 && svb[2]! > 0 && svb[3]! > 0) {
      const s = Math.min(w / svb[2]!, h / svb[3]!);
      inner.ctm = multiply(inner.ctm, [s, 0, 0, s, (w - svb[2]! * s) / 2 - svb[0]! * s, (h - svb[3]! * s) / 2 - svb[1]! * s]);
    }
    visitChildren(target, { ...inner, attrs: inherit(inner.attrs, target.attrs) }, ctx);
  } else visitOne(target, inner, ctx);
}

function shapeToPath(c: LayoutNode, scope: SvgScope, ctx: SvgContext, decorate: boolean): SvgPath | undefined {
  const attrs = { ...scope.attrs, ...c.attrs };
  const g = (k: string, def = 0) => num(attrs[k], def);
  let d: string | undefined;
  let circle: { cx: number; cy: number; r: number } | undefined;
  switch (c.tag) {
    case "path":
      d = attrs["d"];
      break;
    case "circle": {
      const cx = g("cx"), cy = g("cy"), r = g("r");
      d = `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;
      circle = { cx, cy, r };
      break;
    }
    case "rect": {
      const x = g("x"), y = g("y"), w = g("width"), h = g("height");
      const rx = Math.min(g("rx", g("ry")), w / 2), ry = Math.min(g("ry", g("rx")), h / 2);
      d = rx > 0 && ry > 0
        ? `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`
        : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      break;
    }
    case "line":
      d = `M ${g("x1")} ${g("y1")} L ${g("x2")} ${g("y2")}`;
      break;
    case "polyline":
    case "polygon": {
      const pts = (attrs["points"] ?? "").trim().split(/[\s,]+/).map(Number);
      const parts: string[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) parts.push(`${i === 0 ? "M" : "L"} ${pts[i]} ${pts[i + 1]}`);
      d = parts.join(" ") + (c.tag === "polygon" ? " Z" : "");
      break;
    }
    case "ellipse": {
      const cx = g("cx"), cy = g("cy"), rx = g("rx"), ry = g("ry");
      d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} Z`;
      break;
    }
  }
  if (!d) return undefined;
  const p: SvgPath = { d: bake(d, scope.ctm) };
  const prop = (k: string) => styleProp(c, attrs, k, scope);
  const bbox = pathBounds(p.d);

  // A `<line>` has no interior: the browser's default `fill: black` paints nothing.
  const fillRaw = c.tag === "line" ? undefined : prop("fill");
  if (fillRaw && fillRaw !== "none") {
    const grad = fillRaw.startsWith("url(") ? gradientOf(fillRaw, bbox, ctx) : undefined;
    if (grad) p.gradient = grad;
    else if (!fillRaw.startsWith("url(")) p.fill = parseColor(fillRaw);
  }
  if (p.fill || p.gradient) {
    const fo = parseFloat(prop("fill-opacity") ?? "1");
    if (Number.isFinite(fo) && fo < 1) p.fillOpacity = fo;
    if (attrs["fill-rule"] === "evenodd") p.eoFill = true;
  }

  const strokeRaw = prop("stroke");
  if (strokeRaw && strokeRaw !== "none") {
    const grad = strokeRaw.startsWith("url(") ? gradientOf(strokeRaw, bbox, ctx) : undefined;
    if (grad) p.strokeGradient = grad;
    else if (!strokeRaw.startsWith("url(")) p.stroke = parseColor(strokeRaw);
  }
  if (p.stroke || p.strokeGradient) {
    // Stroke metrics are user units of the element; a scaling transform scales them with the geometry.
    const [a, b, cc, dd] = scope.ctm;
    const k = Math.sqrt(Math.abs(a * dd - b * cc));
    const scaled = (v: number) => (Math.abs(k - 1) < 1e-9 ? v : round2(v * k));
    p.strokeWidth = scaled(px(prop("stroke-width") ?? "1"));
    const so = parseFloat(prop("stroke-opacity") ?? "1");
    if (Number.isFinite(so) && so < 1) p.strokeOpacity = so;
    const cap = prop("stroke-linecap");
    if (cap === "round" || cap === "square") p.lineCap = cap;
    const join = prop("stroke-linejoin");
    if (join === "round" || join === "bevel") p.lineJoin = join;
    const miter = parseFloat(attrs["stroke-miterlimit"] ?? "");
    if (Number.isFinite(miter) && miter >= 1) p.miterLimit = miter;
    const dash = parseDash(prop("stroke-dasharray"));
    const phase = parseFloat(prop("stroke-dashoffset") ?? "0") || 0;
    const ring = circle && ringOf(circle, dash, phase, scope.ctm, ctx.vb);
    if (ring) p.ring = ring;
    else if (dash.length) {
      p.dash = dash.map(scaled);
      if (phase) p.dashPhase = scaled(phase);
    }
  }

  const opacity = scope.opacity;
  if (opacity < 1) p.opacity = round2(opacity);

  if (decorate) {
    const clip = reference(c, attrs, "clip-path", ctx);
    if (clip) p.clip = clipOf(clip, scope, bbox, ctx);
    const mask = reference(c, attrs, "mask", ctx);
    if (mask) p.mask = maskOf(mask, scope, ctx);
  }
  return p;
}

// ---------- clip / mask ----------

function clipOf(el: LayoutNode, scope: SvgScope, bbox: Rect, ctx: SvgContext): SvgPath["clip"] | undefined {
  if (el.tag !== "clippath") {
    ctx.notes.push(`unmapped: svg clip-path url(#${el.attrs["id"]})`);
    return undefined;
  }
  // clipPathUnits="objectBoundingBox": the clip's user space is the clipped shape's box.
  const units = el.attrs["clippathunits"] === "objectBoundingBox" ? multiply(scope.ctm, [bbox.w, 0, 0, bbox.h, bbox.x, bbox.y]) : scope.ctm;
  const inner: SvgScope = { ...scope, ctm: multiply(units, ownTransform(el, ctx.notes)), attrs: inherit(scope.attrs, el.attrs) };
  const parts: string[] = [];
  let eoFill: true | undefined;
  for (const c of el.children) {
    if (!SVG_SHAPE_TAGS[c.tag] && c.tag !== "use") continue;
    const before = ctx.paths.length;
    if (c.tag === "use") instantiate(c, inner, ctx);
    else {
      const p = shapeToPath(c, childScope(c, inner, ctx), ctx, false);
      if (p) ctx.paths.push(p);
    }
    for (const p of ctx.paths.splice(before)) parts.push(p.d);
    if ((c.attrs["clip-rule"] ?? el.attrs["clip-rule"]) === "evenodd") eoFill = true;
  }
  if (!parts.length) return undefined;
  const clip: SvgPath["clip"] = { d: parts.join(" ") };
  if (eoFill) clip.eoFill = true;
  return clip;
}

function maskOf(el: LayoutNode, scope: SvgScope, ctx: SvgContext): SvgPath[] | undefined {
  if (el.tag !== "mask") {
    ctx.notes.push(`unmapped: svg mask url(#${el.attrs["id"]})`);
    return undefined;
  }
  ctx.notes.push("approximated: svg mask → luminance mask");
  const inner: SvgScope = { ...scope, ctm: multiply(scope.ctm, ownTransform(el, ctx.notes)), attrs: inherit(scope.attrs, el.attrs) };
  const before = ctx.paths.length;
  visitChildren(el, inner, ctx);
  const paths = ctx.paths.splice(before);
  return paths.length ? paths : undefined;
}
