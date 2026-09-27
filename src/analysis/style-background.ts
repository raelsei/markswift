/** Computed background paint and text-clipped gradients. */
import type { LayoutNode, Rect } from "../model/layout.ts";
import { type Paint, parseBackgroundImage, paintWithin, resolvePaint, splitTop, imageSize, parseBackgroundSize, parseBackgroundPosition, round2, parseBackgroundRepeat, parseColor, px, parseBlendModes, parseRadiusXY } from "../css/index.ts";
import { EDGES, edgeWidth } from "./geometry.ts";

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
 * `background-size`, the intrinsic size of an embedded image, or the cover/contain scaling of
 * that; unresolved external files can only establish a `0% 0%` position.
 */
export function imagePaint(url: string, s: Record<string, string>, prop: "background" | "mask", i: number, w: number, h: number): Paint {
  const img = imageSize(url, w, h);
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

export function backgroundFills(s: Record<string, string>, w: number, h: number, notes: string[]): Paint[] {
  const fills: Paint[] = [];
  const bg = parseColor(s["background-color"]);
  if (bg && bg.a > 0) fills.push({ kind: "solid", color: bg });
  const layers = parseBackgroundImage(s["background-image"]);
  for (let i = 0; i < layers.length; i++) {
    const p = layers[i]!;
    const top = layers.length - 1 - i;
    if (p.kind === "unsupported") notes.push(`unmapped: background-image ${p.raw.slice(0, 40)}${p.reason ? ` (${p.reason})` : ""}`);
    else if (p.kind === "image") fills.push(imagePaint(p.url, s, "background", top, w, h));
    else {
      if (p.kind !== "solid" && p.interpolation === "oklab") notes.push("approximated: CSS Oklab gradient uses SwiftUI perceptual interpolation with stops converted to sRGB; wide-gamut colors and exact interpolation are not proved");
      if (p.kind === "radial" && p.ellipse && /\btext\b/.test(s["background-clip"] ?? "")) notes.push("approximated: elliptical radial text fill uses a circular native text gradient");
      if ((p.kind === "linear" || p.kind === "radial") && p.stops.some(stop => stop.px !== undefined)) notes.push("approximated: absolute gradient stop positions retain normalization to the captured box");
      if (p.kind !== "solid") {
        const origin = layerValue(s["background-origin"], top) ?? "padding-box";
        const originInsets = EDGES.map(edge => edgeWidth(s, edge) + (origin === "content-box" ? px(s[`padding-${edge}`]) : 0));
        if (origin !== "border-box" && originInsets.some(value => value > 0)) notes.push("approximated: gradient background origin uses the border box instead of the authored inset origin");
        const size = layerValue(s["background-size"], top);
        if (size && size !== "auto" && size !== "auto auto") notes.push("approximated: gradient background-size is not applied to its native paint field");
      }
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
      if (f.kind === "linear" || f.kind === "radial" || f.kind === "conic" || f.kind === "solid") {
        const corners = ["top-left", "top-right", "bottom-right", "bottom-left"].map(corner => parseRadiusXY(s[`border-${corner}-radius`], w, h));
        const rounded = corners.some(point => point.some(value => value > 0));
        const uniformRadius = corners.every(point => point[0] === point[1] && point[0] === corners[0]![0]);
        const uniformInset = f.inset.every(value => value === f.inset![0]);
        if (rounded && (!uniformRadius || !uniformInset)) notes.push("approximated: inset background clipping with unequal or elliptical corner radii is not reconstructed");
      }
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

  return fills;
}
