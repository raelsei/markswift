/** Computed visual styles and paint inference. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type Paint, parseBackgroundImage, paintWithin, resolvePaint, splitTop, imageSize, parseBackgroundSize, parseBackgroundPosition, round2, parseBackgroundRepeat, type Color, parseColor, px, parseBlendModes, parseRadiusXY, parseShadows, parseFilters, parseTransform, parseOrigin, parseBlendMode, parseClipPath } from "../css/index.ts";
import { type Style, type Edge } from "../model/semantic.ts";
import { classColorHints } from "./class-hints.ts";
import { EDGES, edgeWidth, type EdgeName } from "./geometry.ts";

/**
 * `background-clip: text` — the box's first gradient layer becomes the glyph fill of `run`
 * (a text-node box inside `el`), re-expressed over that box since native text fills span the
 * glyph run while the browser painted across the whole element. Text builders attach it to
 * the run; `styleOf` drops the box fills in return.
 */
export function textPaintOf(el: LayoutNode, run: Rect): Paint | undefined {
  if (!/\btext\b/.test(el.styles["background-clip"] ?? "")) return undefined;
  const p = parseBackgroundImage(el.styles["background-image"]).find((p) => p.kind === "linear" || p.kind === "radial" || p.kind === "conic");
  return p && paintWithin(resolvePaint(p, el.bounds.w, el.bounds.h), el.bounds, run);
}

/** One `background-*` longhand list → the entry for image layer `i` (top-most first, lists cycle). */
function layerValue(list: string | undefined, i: number): string | undefined {
  const parts = splitTop(list ?? "", ",");
  return parts.length ? parts[i % parts.length] : undefined;
}

/**
 * `url()` layer `i` of `background-*` / `mask-*` → image paint with its size, top-left
 * position and repeat resolved in px. The position needs the drawn size: explicit
 * `background-size`, the intrinsic size of a data: svg, or the cover/contain scaling of
 * that; unknown (raster files) → only a `0% 0%` position is certain.
 */
function imagePaint(url: string, s: Record<string, string>, prop: "background" | "mask", i: number, w: number, h: number): Paint {
  const img = imageSize(url);
  const size = parseBackgroundSize(layerValue(s[`${prop}-size`], i), w, h, img?.w, img?.h);
  const paint: Paint = { kind: "image", url };
  if (size !== undefined) paint.size = size;
  let drawn: { w: number; h: number } | undefined;
  if (size === "cover" || size === "contain") {
    if (img && img.w > 0 && img.h > 0) {
      const k = size === "cover" ? Math.max(w / img.w, h / img.h) : Math.min(w / img.w, h / img.h);
      drawn = { w: img.w * k, h: img.h * k };
    }
  } else drawn = size ?? img;
  const pos = layerValue(s[`${prop}-position`], i);
  if (drawn) paint.position = parseBackgroundPosition(pos, w, h, drawn.w, drawn.h).map(round2) as [number, number];
  else if (pos && /^(0(px|%)?|left|top)(\s+(0(px|%)?|left|top))?$/.test(pos)) paint.position = [0, 0];
  const repeat = parseBackgroundRepeat(layerValue(s[`${prop}-repeat`], i));
  if (repeat && size !== "cover" && size !== "contain") paint.repeat = repeat;
  return paint;
}

/** `nextafterf(256, 0)` — the scale Blink multiplies a shaded channel by before truncating it. */
const BLINK_SCALE = 255.99998474121094;

/**
 * Blink's `Color::Dark()` / `Color::Light()`: every channel scaled so the brightest one loses
 * (dark) or gains (light) 0.33 of full scale, truncated to a byte. Black has no brightest
 * channel to scale up, so Blink lightens it to a fixed #545454. Verified against Chrome 152
 * over greys, hues and both clamping ends.
 */
function shade(c: Color, dir: "dark" | "light"): Color {
  const v = Math.max(c.r, c.g, c.b);
  if (dir === "light" && v === 0) return { r: 84 / 255, g: 84 / 255, b: 84 / 255, a: c.a };
  const m = dir === "dark" ? Math.max(0, (v - 0.33) / v) : Math.min(1, v + 0.33) / v;
  const ch = (x: number) => Math.floor(m * x * BLINK_SCALE) / 255;
  return { r: ch(c.r), g: ch(c.g), b: ch(c.b), a: c.a };
}

/** WCAG relative luminance. */
function relLuminance(c: Color): number {
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * The colour Chrome paints on the lit edges of a 3D border: the declared one, unless darkening
 * the shadowed edges left less than a 1.75 contrast ratio between the two — a dark colour
 * cannot get darker, so the lit edges lighten instead. Measured: the flip is at #373737.
 */
function litEdge(c: Color): Color {
  const y = relLuminance(c);
  const d = relLuminance(shade(c, "dark"));
  return (Math.max(y, d) + 0.05) / (Math.min(y, d) + 0.05) < 1.75 ? shade(c, "light") : c;
}

export function styleOf(n: LayoutNode, notes: string[]): Style {
  const s = n.styles;
  const { w, h } = n.bounds;
  const fills: Paint[] = [];
  const bg = parseColor(s["background-color"]);
  if (bg && bg.a > 0) fills.push({ kind: "solid", color: bg });
  const layers = parseBackgroundImage(s["background-image"]);
  for (let i = 0; i < layers.length; i++) {
    const p = layers[i]!;
    const top = layers.length - 1 - i;
    if (p.kind === "unsupported") notes.push(`unmapped: background-image ${p.raw.slice(0, 40)}`);
    else if (p.kind === "image") fills.push(imagePaint(p.url, s, "background", top, w, h));
    else {
      if (p.kind !== "solid" && p.repeating) notes.push(`approximated: repeating ${p.kind} gradient tiled from its first period`);
      fills.push(resolvePaint(p, w, h));
    }
  }
  const clipBox = s["background-clip"];
  if (clipBox && /\btext\b/.test(clipBox)) fills.length = 0;
  else if (clipBox && /\b(padding|content)-box\b/.test(clipBox)) {
    // The list pairs with image layers top-most first (cycling); the color layer follows the last entry.
    const boxes = splitTop(clipBox, ",");
    const imageStart = fills.length - layers.filter((p) => p.kind !== "unsupported").length;
    fills.forEach((f, j) => {
      if (f.kind === "unsupported") return;
      const box = j < imageStart ? boxes[boxes.length - 1] : boxes[(fills.length - 1 - j) % boxes.length];
      if (box !== "padding-box" && box !== "content-box") return;
      f.inset = EDGES.map((e) => round2(edgeWidth(s, e) + (box === "content-box" ? px(s[`padding-${e}`]) : 0))) as [number, number, number, number];
    });
  }
  // `background-blend-mode` blends a node's own layers against each other, not against the
  // backdrop: the bottom-most layer (the `background-color` when there is one) is the backdrop
  // and carries no mode of its own, and the keyword list is cycled over the *image* layers,
  // top-most first. With nothing underneath a layer there is nothing to blend, so the property
  // is a no-op — which is exactly the shape the shadcn `Avatar` badge has (`bg-blend-color` on
  // a plain `background-color`), and noting it would claim an approximation that is not one.
  const blendModes = parseBlendModes(s["background-blend-mode"]);
  if (blendModes.length && blendModes.some((b) => b !== "normal")) {
    for (let j = 1; j < fills.length; j++) {
      const f = fills[j]!;
      if (f.kind === "unsupported") continue;
      const mode = blendModes[(fills.length - 1 - j) % blendModes.length]!;
      if (mode !== "normal") f.blend = mode;
    }
  }

  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const cornerRadii = corners.map(c => parseRadiusXY(s[`border-${c}-radius`], w, h));
  const ellipse = w > 0 && h > 0 && cornerRadii.every(([rx, ry]) => Math.abs(rx - w / 2) < 0.5 && Math.abs(ry - h / 2) < 0.5);
  const r = cornerRadii.map(([rx, ry], i) => {
    if (!ellipse && Math.abs(rx - ry) > 0.5) notes.push(`approximated: elliptical radius ${s[`border-${corners[i]}-radius`]} → circular`);
    return round2(Math.min((rx + ry) / 2, Math.min(w, h) / 2));
  }) as [number, number, number, number];
  const style: Style = { fills, shadows: parseShadows(s["box-shadow"]) };
  if (ellipse) style.ellipse = true;
  if (r.some((v) => v > 0)) style.radius = r;

  const edges: Partial<Record<EdgeName, Edge>> = {};
  for (const e of EDGES) {
    const width = edgeWidth(s, e);
    const color = parseColor(s[`border-${e}-color`]);
    if (width <= 0 || !color || color.a <= 0) continue;
    const st = s[`border-${e}-style`]!;
    if (st === "solid" || st === "dashed" || st === "dotted" || st === "double") edges[e] = { width, color, style: st };
    else if (st === "inset" || st === "outset" || st === "groove" || st === "ridge") {
      // A 3D border is shaded by the painter, so `border-*-color` is not what Chrome draws: the
      // shadowed pair of edges is darkened (top/left for inset and groove, bottom/right for
      // outset and ridge) and the lit pair keeps the colour, or is lightened when darkening
      // left too little contrast. Groove and ridge swap the two tones half-way through every
      // edge; one `Edge` carries the outer half, which is the whole of a thin border.
      const shadowed = st === "inset" || st === "groove" ? e === "top" || e === "left" : e === "bottom" || e === "right";
      edges[e] = { width, color: shadowed ? shade(color, "dark") : litEdge(color), style: "solid" };
      if (st === "groove" || st === "ridge") notes.push(`approximated: border-${e}-style ${st} → its outer half's tone across the edge`);
    } else {
      edges[e] = { width, color, style: "solid" };
      notes.push(`approximated: border-${e}-style ${st} → solid`);
    }
  }
  const top = edges.top;
  const uniform = top && EDGES.every((e) => edges[e]?.width === top.width && edges[e]?.style === top.style && JSON.stringify(edges[e]?.color) === JSON.stringify(top.color));
  if (top && uniform && (top.style === "solid" || top.style === "dashed")) {
    style.border = { width: top.width, color: top.color };
    if (top.style === "dashed") style.border.dashed = true;
  } else if (Object.keys(edges).length) style.borderSides = edges;

  const op = parseFloat(s["opacity"] ?? "1");
  if (op < 1) style.opacity = op;
  const ox = s["overflow-x"];
  const oy = s["overflow-y"];
  if (ox === "hidden" || ox === "clip" || oy === "hidden" || oy === "clip") style.clip = true;
  const { filters, unsupported } = parseFilters(s["filter"]);
  for (const f of unsupported) notes.push(`unmapped: filter ${f.slice(0, 40)}`);
  if (filters.length === 1 && filters[0]!.kind === "blur") style.blur = filters[0]!.radius;
  else if (filters.length) style.filters = filters;
  for (const f of filters) if (f.kind === "drop-shadow" || f.kind === "sepia") notes.push(`approximated: filter ${f.kind}`);
  const bf = s["backdrop-filter"];
  if (bf && bf !== "none") {
    const m = /blur\(([\d.]+)px\)/.exec(bf);
    style.backdropBlur = m ? +m[1]! : 0;
    notes.push("approximated: backdrop-filter → translucent fill only (no blur)");
  }
  const tf = parseTransform(s["transform"]);
  if (tf?.flattened) notes.push("approximated: transform matrix3d flattened to its x/y projection");
  if (tf && (tf.rotate !== 0 || tf.scaleX !== 1 || tf.scaleY !== 1 || tf.tx !== 0 || tf.ty !== 0 || tf.skewX !== undefined || tf.skewY !== undefined)) {
    const { flattened: _, ...affine } = tf;
    style.transform = affine;
    const origin = parseOrigin(s["transform-origin"]);
    if (origin) style.transform.origin = origin;
  } else if (s["transform"] && s["transform"] !== "none" && !tf) notes.push(`unmapped: transform ${s["transform"].slice(0, 40)}`);
  if (style.shadows.some(sh => sh.inset && sh.blur > 0)) notes.push("approximated: inset shadow blur → native Gaussian blur");
  // Every CSS `<blend-mode>` is a PDF blend function, and so is every SwiftUI `BlendMode`, so a
  // recognised keyword maps by name with no loss; the emitter does the naming. Anything outside
  // the spec's list is reported rather than silently painted `normal`.
  const blend = s["mix-blend-mode"];
  if (blend && blend !== "normal") {
    if (parseBlendMode(blend)) style.blend = blend;
    else notes.push(`unmapped: mix-blend-mode ${blend}`);
  }

  const cp = s["clip-path"];
  if (cp && cp !== "none") {
    const shape = parseClipPath(cp, w, h);
    if (shape) style.clipPath = shape;
    else notes.push(`unmapped: clip-path ${cp.slice(0, 40)}`);
  }
  const mi = s["mask-image"];
  if (mi && mi !== "none") {
    const masks = parseBackgroundImage(mi);
    const first = masks[masks.length - 1]!;
    if (masks.length > 1) notes.push("approximated: mask-image first layer only");
    if (first.kind === "unsupported") notes.push(`unmapped: mask-image ${first.raw.slice(0, 40)}`);
    else if (first.kind === "image") style.mask = imagePaint(first.url, s, "mask", 0, w, h);
    else style.mask = resolvePaint(first, w, h);
  }
  const vis = s["visibility"];
  if (vis === "hidden" || vis === "collapse") {
    style.hidden = true;
    if (vis === "collapse") notes.push("approximated: visibility: collapse → hidden (space kept)");
  }
  if (s["position"] === "sticky") notes.push("approximated: position: sticky (snapshot position)");
  const os = s["outline-style"];
  const ow = px(s["outline-width"]);
  const oc = parseColor(s["outline-color"]);
  if (os && os !== "none" && ow > 0 && oc && oc.a > 0) {
    const known = os === "solid" || os === "dashed" || os === "dotted" || os === "double";
    if (!known) notes.push(`approximated: outline-style ${os} → solid`);
    style.outline = { width: ow, color: oc, style: known ? os : "solid", offset: px(s["outline-offset"]) };
  }
  // Colour-name hints: `var(--x)` from an inline style, plus the semantic part of any colour
  // utility on the class list. Both are names the design gave a colour, and `emit/tokens.ts`
  // promotes a consistent hint to the token's name (`bg-blue-500` → `Color.blue500`).
  const tokens = [...[...(n.attrs["style"] ?? "").matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]!), ...classColorHints(n.attrs)];
  if (tokens.length) style.tokens = [...new Set(tokens)];
  return style;
}
