import type { TextNode, TextRun } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";

/**
 * Natural line height of a face, as a multiple of `font-size`: the height SwiftUI gives one
 * `Text` line before `.lineSpacing`. Measured, not assumed — a `UIHostingController` was asked
 * for the ideal size of one, two and three hard-broken lines on the simulator the verifier uses
 * (`xcrun swiftc -target arm64-apple-ios18.0-simulator probe.swift`, `xcrun simctl spawn`), so
 * `N = h2 - h1 = h3 - h2`; at every size from 10 to 60 pt it came out equal to
 * `CTFontGetAscent + CTFontGetDescent + CTFontGetLeading`, and SwiftUI then rounds the *total*
 * up to a third of a point. Weight does not move it.
 *
 * All four `Font.Design` values share one ratio. The faces really do differ — the probe resolved
 * `.SFUI-Regular`, `.AppleSystemUIFontRounded-Regular`, `.AppleSystemUIFontMonospaced-Regular`
 * and `.NewYork-Regular`, and "Hamburgefonstiv" at 16 pt measures 125.0 / 121.667 / 148.667 /
 * 130.0 pt wide — but Apple keeps the system faces metric-compatible: ascent 0.952148 em,
 * descent 0.241211 em, leading 0, i.e. SF Pro's `hhea` (1950 + 494) / 2048. The old assumption
 * was 1.2, which over-states the leading of every label by 0.0066 em.
 */
const SYSTEM_LINE_HEIGHT = 1.193359;

export function naturalLineHeight(f: TextRun["font"], metrics: FontMetrics): number {
  if (f.family.kind !== "custom") return f.size * SYSTEM_LINE_HEIGHT;
  const m = metrics[f.family.name.toLowerCase()];
  const ratio = m ? (m.ascent + m.descent + m.lineGap) / m.upem : SYSTEM_LINE_HEIGHT;
  return f.size * ratio;
}


/** Whole-word CSS flow for measured plain text; legacy paragraphs retain their previous route. */
export function usesGreedyWords(n: TextNode): boolean {
  const heading = /^h[1-6]$/.test(n.sourceTag ?? "");
  if ((!n.lineBox && n.sourceTag !== "p" && !heading) || n.runs.length !== 1 || n.align !== "leading" || n.layoutDirection === "rtl" || n.noWrap || n.lineLimit || n.truncate || n.wrapAnywhere) return false;
  if (n.overlays.length || n.style.clip || n.maxHeight !== undefined || n.style.hidden) return false;
  const r = n.runs[0]!;
  if (r.href || r.gap !== undefined || r.bound || r.italic || r.decoration || r.shadow || r.paint || r.kerning || r.transform || r.tabularNums || r.baselineOffset !== undefined) return false;
  const lineHeight = r.font.lineHeight ?? n.lineBox?.baselineStep;
  if (r.font.family.kind !== "system" || r.font.family.design !== "default" || (!n.lineBox && !heading && r.font.weight !== 400) || lineHeight === undefined) return false;
  // Whole-word advances prove placement only for tokens with no internal CSS break point.
  // Measured hyphenated/slashed/code-like text keeps ordinary native Text wrapping instead.
  if (n.lineBox && r.text.split(" ").some(word => !/^[A-Za-z0-9_]+(?:['.][A-Za-z0-9_]+)*[.,;:!?]*$/.test(word))) return false;
  // Headings often set a tight line-height; MarkswiftFlow can preserve its negative row gap.
  if (!n.lineBox && !heading && lineHeight < naturalLineHeight(r.font, {})) return false;
  if (n.notes.some((note) => note.includes("font-family"))) return false;
  return /^[\x21-\x7E]+(?: [\x21-\x7E]+)*$/.test(r.text) && (n.lineBox !== undefined || r.text.includes(" "));
}
