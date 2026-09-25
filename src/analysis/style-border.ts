/** CSS border geometry and Chrome's 3D edge shading. */
import type { Style, Edge } from "../model/semantic.ts";
import { type Color, parseColor, parseRadiusXY, round2 } from "../css/index.ts";
import { EDGES, edgeWidth, type EdgeName } from "./geometry.ts";

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

export function borderStyle(s: Record<string, string>, w: number, h: number, notes: string[]): Partial<Style> {
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const cornerRadii = corners.map(c => parseRadiusXY(s[`border-${c}-radius`], w, h));
  const ellipse = w > 0 && h > 0 && cornerRadii.every(([rx, ry]) => Math.abs(rx - w / 2) < 0.5 && Math.abs(ry - h / 2) < 0.5);
  const r = cornerRadii.map(([rx, ry], i) => {
    if (!ellipse && Math.abs(rx - ry) > 0.5) notes.push(`approximated: elliptical radius ${s[`border-${corners[i]}-radius`]} → circular`);
    return round2(Math.min((rx + ry) / 2, Math.min(w, h) / 2));
  }) as [number, number, number, number];
  const style: Partial<Style> = {};
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

  return style;
}
