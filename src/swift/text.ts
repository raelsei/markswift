import type { TextNode, TextRun } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
import type { ColorCtx, EmitMode } from "./context.ts";
import { colorExpr, fontExpr, num, str } from "./format.ts";
import { paintExpr } from "./paint.ts";
import { note } from "./diagnostics.ts";
import { textBoxAlignment, clipsFirstLine, SYSTEM_LINE_HEIGHT } from "./text-box.ts";

function naturalLineHeight(f: TextRun["font"], metrics: FontMetrics): number {
  if (f.family.kind !== "custom") return f.size * SYSTEM_LINE_HEIGHT;
  const m = metrics[f.family.name.toLowerCase()];
  const ratio = m ? (m.ascent + m.descent + m.lineGap) / m.upem : SYSTEM_LINE_HEIGHT;
  return f.size * ratio;
}

export function textExpr(n: TextNode, ctx: ColorCtx & { mode: EmitMode; fontMetrics: FontMetrics }): string[] {
  const runs = n.runs;
  if (ctx.mode === "app" && usesGreedyWords(n)) {
    const run = runs[0]!;
    const natural = naturalLineHeight(run.font, ctx.fontMetrics);
    const leading = run.font.lineHeight! - natural;
    const out = [`MarkswiftGreedyText(${str(run.text)}, font: ${fontExpr(run.font, ctx)}, color: ${colorExpr(run.color, ctx, n.id, run.paint ? undefined : "run0")}, fontSize: ${num(run.font.size)}, lineGap: ${num(leading)})`];
    if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * run.font.lineHeight! - 0.5) {
      out.push(`.padding(.vertical, ${num(leading / 2)})`);
    }
    return out;
  }
  // Whole-text decisions (case, line height, shadow) come from the runs that carry glyphs.
  const glyphs = runs.filter((r) => r.gap === undefined);
  // `.textCase` covers the whole Text: only a transform every run shares; otherwise (and for
  // `capitalize`, which has no case) the literal.
  const shared = glyphs.every((r) => r.transform === glyphs[0]?.transform) ? glyphs[0]?.transform : undefined;
  const viewCase = shared === "uppercase" || shared === "lowercase" ? shared : undefined;
  // RTL base direction: `.environment(\.layoutDirection, .rightToLeft)` does not reach the bidi
  // algorithm, and CoreText takes the base level from the first strong character, so a leading
  // U+200F (RIGHT-TO-LEFT MARK) places trailing neutrals as the browser does.
  const parts = runs.map((r, i) => runExpr(r, i, n, viewCase === undefined, ctx));
  if (n.layoutDirection === "rtl") parts.unshift("Text.markswiftRTL");
  // An array, not a `Text + Text + …` chain: the chain's typecheck cost is superlinear (14 runs
  // exhaust the solver on the iOS 18 SDK); array elements are checked one at a time.
  const out: string[] = parts.length === 1 ? [parts[0]!] : ["Text.markswiftRuns([", ...parts.map((p) => `    ${p},`), "])"];
  if (n.align !== "leading") out.push(`.multilineTextAlignment(.${n.align})`);
  if (n.lineLimit !== undefined) out.push(`.lineLimit(${n.lineLimit})`);
  if (n.truncate) out.push(".truncationMode(.tail)");
  const first = glyphs[0];
  // CSS `line-height` is leading, never a pinned height (that would freeze Dynamic Type):
  // `.lineSpacing` is its between-lines part, in app mode even when the browser did not wrap.
  const natural = first ? naturalLineHeight(first.font, ctx.fontMetrics) : 0;
  const leading = first?.font.lineHeight === undefined ? 0 : first.font.lineHeight - natural;
  if (leading >= 0.01 && (ctx.mode === "app" || n.lines > 1)) out.push(`.lineSpacing(${num(leading)})`);
  // SwiftUI clamps a negative `.lineSpacing` to zero.
  if (leading <= -0.01 && n.lines > 1) note(n, "approximated", "line-height", `line-height ${num(natural + leading)} is tighter than the face's natural ${num(natural)} → lines cannot be compressed`);
  if (viewCase) out.push(`.textCase(.${viewCase})`);
  // `.shadow` is a View modifier too: one shadow for the whole text.
  const shadow = glyphs.find((r) => r.shadow)?.shadow;
  if (shadow) {
    if (shadow.color.a > 0) out.push(`.shadow(color: ${colorExpr(shadow.color, ctx, n.id)}, radius: ${num(shadow.blur / 2)}, x: ${num(shadow.x)}, y: ${num(shadow.y)})`);
    if (!glyphs.every((r) => r.shadow === undefined || JSON.stringify(r.shadow) === JSON.stringify(shadow))) note(n, "approximated", "text-shadow", "text-shadow of the first shadowed run applied to the whole text");
  }
  // Soft wrapping is off for `nowrap` text, a single word CSS cannot break and, in fidelity,
  // whenever the browser's line division is known (baked-in breaks, or a single line that fit).
  // Ellipsised text (overflow or line clamp) keeps a flexible width. App mode never bakes breaks
  // into the literal.
  const clamped = n.lineLimit !== undefined && n.noWrap !== true;
  const divided = n.noWrap === true || (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length));
  const noSoftWrap = !n.truncate && !clamped && (divided || n.unbreakable === true || (ctx.mode === "fidelity" && n.lines === 1));
  out.push(`.fixedSize(horizontal: ${noSoftWrap}, vertical: true)`);
  // Fidelity pins the browser's line box (native line heights would drift the vertical rhythm).
  // App lets native metrics decide; alignment comes from `frameModifier`.
  if (ctx.mode === "fidelity") {
    // A clipped box shows its top lines (CSS), so it aligns to the top; text that fits stays
    // centred, which reproduces the CSS half-leading.
    const written = 1 + runs.reduce((k, r) => k + (r.text.match(/\n/g)?.length ?? 0) + (r.breaks?.length ?? 0), 0);
    const shown = n.lineLimit === undefined ? written : Math.min(written, n.lineLimit);
    const align = textBoxAlignment(n, shown > n.lines || clipsFirstLine(n));
    // Width is pinned only for text the browser broke; a single line that fit is held by
    // `fixedSize` alone so it stays flexible beside siblings.
    const size = [noSoftWrap && divided ? `width: ${num(n.frame.w - n.padding[1] - n.padding[3])}` : "", `height: ${num(n.frame.h - n.padding[0] - n.padding[2])}`].filter(Boolean);
    out.push(`.frame(${size.join(", ")}, alignment: ${align})`);
  }
  // App mode: the half-leading above the first and below the last line, as padding so it grows
  // with Dynamic Type. Only when the measured box is the line box (not a clipped box or a
  // glyph-box union between flow children).
  else if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * (natural + leading) - 0.5) {
    out.push(`.padding(.vertical, ${num(leading / 2)})`);
  }
  return out;
}

/** Keep word layout on a narrow, static subset; styled/interactive text retains native Text. */
function usesGreedyWords(n: TextNode): boolean {
  if (n.sourceTag !== "p" || n.runs.length !== 1 || n.align !== "leading" || n.layoutDirection === "rtl" || n.noWrap || n.lineLimit || n.truncate) return false;
  if (n.overlays.length || n.style.clip || n.maxHeight !== undefined || n.style.hidden) return false;
  const r = n.runs[0]!;
  if (r.gap !== undefined || r.italic || r.decoration || r.shadow || r.paint || r.kerning || r.transform || r.tabularNums || r.baselineOffset !== undefined) return false;
  if (r.font.family.kind !== "system" || r.font.family.design !== "default" || r.font.weight !== 400 || r.font.lineHeight === undefined) return false;
  if (r.font.lineHeight < naturalLineHeight(r.font, {})) return false;
  if (n.fontSubstituted) return false;
  return /^[\x21-\x7E]+(?: [\x21-\x7E]+)+$/.test(r.text);
}

/** One run as a `Text` expression (every modifier here returns `Text`, so runs concatenate). */
function runExpr(r: TextRun, i: number, n: TextNode, literalTransform: boolean, ctx: ColorCtx & { mode: EmitMode }): string {
  // A gap run is pure advance; a named call keeps the run array cheap to typecheck.
  if (r.gap !== undefined) return `Text.markswiftGap(${num(r.gap)})`;
  let text = r.text;
  // Fidelity bakes the browser's line division in as hard breaks; the collapsible space at a
  // break becomes the newline.
  if (ctx.mode === "fidelity" && r.breaks?.length) {
    let at = 0;
    let broken = "";
    for (const b of r.breaks) {
      broken += text.slice(at, text[b - 1] === " " ? b - 1 : b) + "\n";
      at = b;
    }
    text = broken + text.slice(at);
  }
  if (literalTransform && r.transform) {
    text = transformLiteral(text, r.transform);
    if (r.transform === "capitalize") note(n, "approximated", "text-transform: capitalize", "text-transform capitalize applied to the literal (no .textCase equivalent)");
  }
  let e = `Text(verbatim: ${str(text)})`;
  e += `.font(${fontExpr(r.font, ctx)})`;
  if (r.italic) e += ".italic()";
  // `background-clip: text`: the paint is the glyph fill (`Text.foregroundStyle` takes any ShapeStyle).
  const paint = r.paint && r.paint.kind !== "image" && r.paint.kind !== "unsupported" ? paintExpr(r.paint, n.frame.w, n.frame.h, ctx, n.id) : undefined;
  if (r.paint && !paint) note(n, "approximated", "background-clip: text", `background-clip text with a ${r.paint.kind} paint falls back to the text color`);
  // A run's own slot key (`run2`) resolves it even when the node paints its colour twice; a
  // paint fallback colour is no enumerated slot, so it keeps the node-wide lookup.
  e += `.foregroundStyle(${paint ?? colorExpr(r.color, ctx, n.id, r.paint ? undefined : `run${i}`)})`;
  if (r.decoration) {
    const d = r.decoration;
    const pattern = d.style === "dotted" ? ".dot" : d.style === "dashed" ? ".dash" : undefined;
    if (d.style === "wavy" || d.style === "double") note(n, "approximated", "text-decoration-style", `text-decoration-style ${d.style} drawn solid`);
    const args = [pattern ? `pattern: ${pattern}` : "", d.color ? `color: ${colorExpr(d.color, ctx, n.id, `run${i}.dec`)}` : ""].filter(Boolean).join(", ");
    for (const line of d.lines) {
      if (line === "underline") e += `.underline(${args})`;
      else if (line === "line-through") e += `.strikethrough(${args})`;
      else note(n, "approximated", "text-decoration-line: overline", "text-decoration-line overline has no SwiftUI form; dropped");
    }
  }
  if (r.kerning !== undefined && r.kerning !== 0) e += `.kerning(${num(r.kerning)})`;
  if (r.tabularNums) e += ".monospacedDigit()";
  if (r.baselineOffset !== undefined) e += `.baselineOffset(${num(r.baselineOffset)})`;
  return e;
}

/** CSS `text-transform` on a literal; `capitalize` uppercases the first letter of each word. */
function transformLiteral(text: string, t: NonNullable<TextRun["transform"]>): string {
  if (t === "uppercase") return text.toUpperCase();
  if (t === "lowercase") return text.toLowerCase();
  return text.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}
