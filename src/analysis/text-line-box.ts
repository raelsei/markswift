/** A measured line box only when every glyph run shares one supported native font. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextNode, TextLineBox } from "../model/semantic.ts";
import type { MeasuredTextRun, SourceTextRun } from "./context.ts";
import { fontFamilies, round2 } from "../css/index.ts";
import { fontOf } from "./typography.ts";

const nativeFamilies = new Set(["system-ui", "-apple-system", "blinkmacsystemfont"]);

/** Preserve absolute baselines when a caption adopts its containing CSS content box. */
export function reframeText(node: TextNode, frame: TextNode["frame"]): void {
  const box = node.lineBox;
  if (box) {
    const top = node.frame.y - frame.y, bottom = frame.y + frame.h - node.frame.y - node.frame.h;
    const firstBaseline = round2(box.firstBaseline + top), baselineToBottom = round2(box.baselineToBottom + bottom);
    if (firstBaseline >= 0 && baselineToBottom >= 0) node.lineBox = { ...box, firstBaseline, baselineToBottom,
      baselines: box.baselines.map(baseline => round2(baseline + top)) };
    else {
      delete node.lineBox;
      node.notes.push("approximated: caption content box clips measured baselines; native text placement retained");
    }
  }
  node.frame = frame;
}

export function measuredTextLineBox(host: LayoutNode, node: TextNode, built: MeasuredTextRun[], sources: SourceTextRun[] = built, note?: (message: string) => void): TextLineBox | undefined {
  const glyphs = built.filter(value => /\S/.test(value.run.text) && value.run.gap === undefined);
  const first = glyphs[0];
  if (!first || first.node.firstBaseline === undefined || node.layoutDirection === "rtl" || node.lineLimit !== undefined || node.truncate || node.maxHeight !== undefined
    || node.overlays.length || node.style.clip || node.style.clipPath || host.flattenedCustomElements?.length
    || node.runs.some(run => run.gap !== undefined) || node.notes.some(note => note.includes("font-family"))) return;
  const font = first.run.font;
  if (font.family.kind !== "system" || font.family.design !== "default") return;
  const normal = font.lineHeight === undefined;
  // A single auto-height normal line is independently bounded by its captured primary
  // font box. Allocated table spans and fixed/minimum-height surplus cannot prove it.
  if (normal && (node.lines !== 1 || host.preferredSize?.height !== "auto")) return;
  const step = font.lineHeight ?? first.node.bounds.h;
  if (!Number.isFinite(step) || step <= 0 || (!normal && step < font.size * 1.193359 - 0.01)) return;
  if (!Number.isInteger(font.weight) || font.weight < 100 || font.weight > 900 || font.weight % 100 !== 0) {
    note?.(`approximated: measured baseline geometry is not admitted for font-weight ${font.weight}; the nearest named native weight remains in use`);
    return;
  }
  const fingerprint = JSON.stringify(font);
  // Whitespace still contributes native font ascent/descent to a Text line.
  if (node.runs.some(run => JSON.stringify(run.font) !== fingerprint)
    || sources.some(source => JSON.stringify(fontOf(source.styleOf.styles, {})) !== fingerprint)) return;
  for (const value of glyphs) {
    const run = value.run, style = value.styleOf.styles;
    if (JSON.stringify(run.font) !== fingerprint || run.italic || run.bound || run.baselineOffset !== undefined || run.gap !== undefined
      || run.transform || run.kerning || run.tabularNums || run.paint || run.shadow
      || !nativeFamilies.has(fontFamilies(style["font-family"])[0]?.toLowerCase() ?? "")
      || (style.direction && style.direction !== "ltr") || (style["writing-mode"] && style["writing-mode"] !== "horizontal-tb")
      || (style.transform && style.transform !== "none") || value.node.firstBaseline === undefined) return;
  }
  const measured = glyphs.flatMap(value => value.node.lines?.length
    ? value.node.lines.map(line => line.baseline)
    : [value.node.firstBaseline]);
  if (measured.some(value => value === undefined || !Number.isFinite(value))) return;
  const baselines: number[] = [];
  for (const baseline of (measured as number[]).sort((a, b) => a - b)) {
    if (!baselines.length || baseline - baselines.at(-1)! > 0.15) baselines.push(baseline);
  }
  if (baselines.length !== node.lines || baselines.slice(1).some((baseline, i) => Math.abs(baseline - baselines[i]! - step) > 0.15)) return;
  const origin = node.frame.y + node.padding[0], height = node.frame.h - node.padding[0] - node.padding[2];
  if (normal && (Math.abs(height - step) > 0.15 || glyphs.some(value => Math.abs(value.node.bounds.h - step) > 0.15))) return;
  const firstBaseline = baselines[0]! - origin, baselineToBottom = origin + height - baselines.at(-1)!;
  if (firstBaseline < 0 || baselineToBottom < 0 || firstBaseline > step || baselineToBottom > step) return;
  return { firstBaseline: round2(firstBaseline), baselineToBottom: round2(baselineToBottom), baselineStep: step,
    baselines: baselines.map(baseline => round2(baseline - origin)) };
}
