/** Resolve SVG labels and measured text placement. */
import { type LayoutNode, type Rect } from "../../model/layout.ts";
import { addDiagnostic } from "../../model/semantic.ts";
import { parseColor, round2 } from "../../css/index.ts";
import { fontOf } from "../typography.ts";
import { type SvgScope, type SvgContext } from "./context.ts";
import { num, styleProp, inherit } from "./attributes.ts";

// ---------- text ----------

export function collectText(el: LayoutNode, scope: SvgScope, pos: { x: number; y: number }, ctx: SvgContext): void {
  const attrs = { ...scope.attrs, ...el.attrs };
  const at = { x: num(el.attrs["x"], pos.x), y: num(el.attrs["y"], pos.y) };
  const anchorRaw = attrs["text-anchor"];
  const anchor = anchorRaw === "middle" || anchorRaw === "end" ? anchorRaw : "start";
  if (el.tag === "text") addDiagnostic(ctx.diagnostics, "approximated", "svg:text", "svg text → positioned Text");
  for (const c of el.children) {
    if (c.tag === "#text") {
      const text = c.text ?? "";
      if (!text.trim()) continue;
      const fill = parseColor(styleProp(el, attrs, "fill", scope)) ?? { r: 0, g: 0, b: 0, a: 1 };
      // Markup has no computed style (no `font-size`): the font comes from the presentation attributes.
      const font = fontOf(el.styles["font-size"] === undefined ? { "font-size": `${num(styleProp(el, attrs, "font-size", scope), 16)}px`, "font-family": attrs["font-family"] ?? "serif", "font-weight": attrs["font-weight"] ?? "400" } : el.styles, ctx.bundledFamilies);
      const box = c.bounds.w > 0 ? { x: round2(c.bounds.x - ctx.frame.x), y: round2(c.bounds.y - ctx.frame.y), w: round2(c.bounds.w), h: round2(c.bounds.h) } : derivedBox(text, at, anchor, el, attrs, scope, ctx);
      ctx.texts.push({ text, x: at.x, y: at.y, anchor, font, fill, box });
    } else if (c.tag === "tspan" || c.tag === "a") collectText(c, { ...scope, attrs: inherit(scope.attrs, el.attrs) }, at, ctx);
    else if (c.tag === "textpath") addDiagnostic(ctx.diagnostics, "unmapped", "svg:textPath", "svg textPath");
  }
}

/**
 * Text box for markup that never went through the browser (a `data:` SVG): the glyph run is not
 * measured, so the box is derived from the anchor point, `text-anchor` and the font size in
 * viewBox units, using a mean advance of 0.55 em — enough to place the run, never exact.
 * Scaled into frame coordinates like every other box `collectText` records.
 */
function derivedBox(text: string, at: { x: number; y: number }, anchor: "start" | "middle" | "end", el: LayoutNode, attrs: Record<string, string>, scope: SvgScope, ctx: SvgContext): Rect {
  const size = num(styleProp(el, attrs, "font-size", scope), 16) || 16;
  const w = text.length * size * 0.55;
  const sx = ctx.vb[2] ? ctx.frame.w / ctx.vb[2] : 1;
  const sy = ctx.vb[3] ? ctx.frame.h / ctx.vb[3] : 1;
  // `y` is the baseline; the box is the em box around it (ascent ≈ 0.8 em).
  const x = anchor === "middle" ? at.x - w / 2 : anchor === "end" ? at.x - w : at.x;
  addDiagnostic(ctx.diagnostics, "approximated", "svg:text", "svg text box estimated (markup has no measured glyph run)");
  return { x: round2((x - ctx.vb[0]) * sx), y: round2((at.y - size * 0.8 - ctx.vb[1]) * sy), w: round2(w * sx), h: round2(size * sy) };
}
