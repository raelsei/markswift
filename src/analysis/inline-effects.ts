/** Effects on inline nodes whose text is merged into a host Text view. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextRun } from "../model/semantic.ts";
import { parseColor, parseShadows, px, type Color, type Paint } from "../css/index.ts";
import { EDGES, edgeWidth } from "./geometry.ts";
import { inlineChain } from "./text-layout.ts";
import { reportStaticMotion } from "./style-effects.ts";

/** Opacity is not inherited; visibility is, and a descendant can explicitly restore it. */
export function inlinePresentation(host: LayoutNode, element: LayoutNode): { opacity: number; hidden: boolean } {
  let opacity = 1;
  let visibility = host.styles.visibility ?? "visible";
  for (const inline of inlineChain(host, element)) {
    const ownOpacity = Number.parseFloat(inline.styles.opacity ?? "1");
    if (Number.isFinite(ownOpacity)) opacity *= Math.max(0, Math.min(1, ownOpacity));
    visibility = inline.styles.visibility ?? visibility;
  }
  return { opacity, hidden: visibility === "hidden" || visibility === "collapse" };
}

const unsupportedEffects: Record<string, string> = {
  filter: "none", "backdrop-filter": "none", "mask-image": "none", "clip-path": "none",
  "mix-blend-mode": "normal", isolation: "auto",
};

/** Visible inline box decoration collected below the merged glyphs. Computed colors are resolved. */
export function inlineBoxHasPaint(inline: LayoutNode): boolean {
  const styles = inline.styles;
  const image = styles["background-image"];
  if ((image && image !== "none") || (parseColor(styles["background-color"])?.a ?? 0) > 0) return true;
  const outline = styles["outline-style"];
  if (outline && outline !== "none" && outline !== "hidden" && px(styles["outline-width"]) > 0 &&
    (parseColor(styles["outline-color"] ?? styles.color)?.a ?? 0) > 0) return true;
  if (EDGES.some(edge => edgeWidth(styles, edge) > 0 &&
    (parseColor(styles[`border-${edge}-color`] ?? styles.color)?.a ?? 0) > 0)) return true;
  return parseShadows(styles["box-shadow"]).some(shadow => shadow.color.a > 0);
}

/** Keep glyph advances while applying supported paint; report effects lost at the merge. */
export function applyInlineEffects(host: LayoutNode, element: LayoutNode, run: TextRun, note: (message: string) => void): void {
  const chain = inlineChain(host, element);
  for (const inline of chain) {
    reportStaticMotion(inline.styles, note);
    for (const [property, initial] of Object.entries(unsupportedEffects)) {
      const value = inline.styles[property];
      if (value && value !== initial) note(`approximated: inline ${property}: ${value} is not applied to merged text; inline box decoration may differ`);
    }
  }
  const { opacity, hidden } = inlinePresentation(host, element);
  if (!hidden && (host.styles.visibility === "hidden" || host.styles.visibility === "collapse")) {
    note("approximated: inline visibility: visible inside a hidden text host remains hidden; the host and its text share one native view");
  }
  const alpha = hidden ? 0 : opacity;
  run.color = fade(run.color, alpha);
  if (hidden) {
    // A gradient fill, separately colored decoration, shadow or URL could otherwise survive
    // a transparent foreground. Keep the literal/font so this run still occupies its space.
    delete run.paint;
    delete run.decoration;
    delete run.shadow;
    delete run.href;
    return;
  }
  if (run.decoration?.color) run.decoration = { ...run.decoration, color: fade(run.decoration.color, alpha) };
  if (run.shadow) run.shadow = { ...run.shadow, color: fade(run.shadow.color, alpha) };
  if (run.paint) run.paint = fadePaint(run.paint, alpha);
  if (opacity > 0 && opacity < 1 && chain.some(inlineBoxHasPaint)) {
    note("approximated: inline opacity is applied to glyph and box paints separately; overlapping paint is not composited as a CSS group");
  }
}

function fade(color: Color, alpha: number): Color { return { ...color, a: color.a * alpha }; }
function fadePaint(paint: Paint, alpha: number): Paint {
  if ("stops" in paint) return { ...paint, stops: paint.stops.map(stop => ({ ...stop, color: fade(stop.color, alpha) })) };
  if (paint.kind === "solid") return { ...paint, color: fade(paint.color, alpha) };
  return paint;
}
