/** CSS border geometry and Chrome's 3D edge shading. */
import { type Style, type Edge, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import { parseColor, parseRadiusXY, round2 } from "../css/index.ts";
import type { Color } from "../model/values.ts";
import { EDGES, edgeWidth, type EdgeName } from "./geometry.ts";

/** `nextafterf(256, 0)` — the scale Blink multiplies a shaded channel by before truncating it. */
const BLINK_SCALE = 255.99998474121094;

/**
 * Blink's `Color::Dark()` / `Color::Light()`: every channel scaled so the brightest one loses
 * (dark) or gains (light) 0.33 of full scale, truncated to a byte. Black has no brightest
 * channel to scale up, so Blink lightens it to a fixed #545454. Verified against Chrome 152
 * and 155 over greys, hues and both clamping ends.
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
 * Luminance bounds of Blink's 3D edge shading (WebKit's algorithm, `CalculateInsetOutsetColor`):
 * at or below rgb(32, 32, 32) a colour is "very dark", above rgb(235, 235, 235) "very light".
 */
const BASE_DARK_LUMINANCE = relLuminance(parseColor("rgb(32, 32, 32)")!);
const BASE_LIGHT_LUMINANCE = relLuminance(parseColor("rgb(235, 235, 235)")!);

/**
 * The colour Chrome paints on one edge of a 3D border: the shadowed edge darkens and the lit edge
 * lightens, unless the colour is very light (the lit edge keeps it); a very dark colour cannot
 * darken, so it lightens once for the shadowed edge and twice for the lit one (black: #545454
 * shadowed, #a8a8a8 lit). ponytail: calibrated at DPR 2, light + dark scheme, over greys, hues and
 * both thresholds on Chrome 155 and the corpus's Chromium 153 (same pixels); Chrome 152 kept the
 * lit colour and lightened it only under a 1.75 contrast ratio (black #545454 / #000). Re-measure
 * if Blink changes `CalculateInsetOutsetColor` again.
 */
function edgeShade(c: Color, shadowed: boolean): Color {
  const y = relLuminance(c);
  if (y <= BASE_DARK_LUMINANCE) return shadowed ? shade(c, "light") : shade(shade(c, "light"), "light");
  if (shadowed) return shade(c, "dark");
  return y > BASE_LIGHT_LUMINANCE ? c : shade(c, "light");
}

/**
 * Chrome's form-control theme. A `<button>`/`<input>` whose author set no background, border or
 * radius (a text field: nor `box-shadow`) and kept `appearance` is not painted from its computed
 * UA border (`2px outset`/`2px inset`): Chrome draws a flat 1px edge with 2px corners over the
 * computed fill, keeping the 2px layout. Keyed by the UA default's computed `border-style
 * border-color / background-color` per colour scheme (light, dark); the value is the edge colour.
 * ponytail: calibrated at DPR 2, light + dark, on Chrome 155 and the corpus's Chromium 153 (same
 * pixels); re-measure if Chrome restyles its controls. Disabled defaults are not listed, so a
 * disabled control keeps its CSS paint; textarea/select (1px solid UA border) keep square corners.
 */
const THEMED_EDGE: Record<string, Color> = {
  "outset rgb(0, 0, 0) / rgb(239, 239, 239)": parseColor("rgb(118, 118, 118)")!,
  "outset rgb(255, 255, 255) / rgb(107, 107, 107)": parseColor("rgb(107, 107, 107)")!,
  "inset rgb(118, 118, 118) / rgb(255, 255, 255)": parseColor("rgb(118, 118, 118)")!,
  "inset rgb(133, 133, 133) / rgb(59, 59, 59)": parseColor("rgb(133, 133, 133)")!,
};
const THEMED_RADIUS = 2;

/** The 1px themed edge Chrome paints instead of `s`'s computed border, when it draws its theme. */
export function themedBorder(tag: string, s: Record<string, string>): Partial<Style> | undefined {
  if (tag !== "button" && tag !== "input") return undefined;
  if (s["appearance"] === "none" || s["background-image"] !== "none") return undefined;
  const st = s["border-top-style"];
  const c = s["border-top-color"];
  const color = THEMED_EDGE[`${st} ${c} / ${s["background-color"]}`];
  if (!color || (st === "inset" && s["box-shadow"] !== "none")) return undefined;
  const ua = EDGES.every(
    (e) => s[`border-${e}-style`] === st && s[`border-${e}-width`] === "2px" && s[`border-${e}-color`] === c,
  );
  const square = ["top-left", "top-right", "bottom-right", "bottom-left"].every(
    (k) => s[`border-${k}-radius`] === "0px",
  );
  if (!ua || !square) return undefined;
  const r = THEMED_RADIUS;
  return { border: { width: 1, color }, radius: [r, r, r, r] };
}

export function borderStyle(
  s: Record<string, string>,
  w: number,
  h: number,
  diagnostics: Diagnostic[],
): Partial<Style> {
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const cornerRadii = corners.map((c) => parseRadiusXY(s[`border-${c}-radius`], w, h));
  const ellipse =
    w > 0 && h > 0 && cornerRadii.every(([rx, ry]) => Math.abs(rx - w / 2) < 0.5 && Math.abs(ry - h / 2) < 0.5);
  const r = cornerRadii.map(([rx, ry], i) => {
    if (!ellipse && Math.abs(rx - ry) > 0.5)
      addDiagnostic(
        diagnostics,
        "approximated",
        `border-${corners[i]}-radius`,
        `elliptical radius ${s[`border-${corners[i]}-radius`]} → circular`,
      );
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
      // shadowed pair of edges (top/left for inset and groove, bottom/right for outset and ridge)
      // and the lit pair take `edgeShade`'s two tones. Groove and ridge swap the two tones half-way
      // through every edge; one `Edge` carries the outer half, which is the whole of a thin border.
      const shadowed =
        st === "inset" || st === "groove" ? e === "top" || e === "left" : e === "bottom" || e === "right";
      edges[e] = { width, color: edgeShade(color, shadowed), style: "solid" };
      if (st === "groove" || st === "ridge")
        addDiagnostic(
          diagnostics,
          "approximated",
          `border-${e}-style`,
          `border-${e}-style ${st} → its outer half's tone across the edge`,
        );
    } else {
      edges[e] = { width, color, style: "solid" };
      addDiagnostic(diagnostics, "approximated", `border-${e}-style`, `border-${e}-style ${st} → solid`);
    }
  }
  const top = edges.top;
  const uniform =
    top &&
    EDGES.every(
      (e) =>
        edges[e]?.width === top.width &&
        edges[e]?.style === top.style &&
        JSON.stringify(edges[e]?.color) === JSON.stringify(top.color),
    );
  if (top && uniform && (top.style === "solid" || top.style === "dashed")) {
    style.border = { width: top.width, color: top.color };
    if (top.style === "dashed") style.border.dashed = true;
  } else if (Object.keys(edges).length) style.borderSides = edges;

  return style;
}
