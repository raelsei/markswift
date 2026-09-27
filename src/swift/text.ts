import type { TextNode, TextRun } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
import type { EmitMode } from "./context.ts";
import { colorExpr, fontExpr, num, str, type ColorCtx } from "./format.ts";
import { paintExpr } from "./paint.ts";
import { note } from "./diagnostics.ts";
import { textBoxAlignment, clipsFirstLine } from "./text-box.ts";
import { textLineBoxExpr, nativeTextWeight } from "./text-line-box.ts";
import { naturalLineHeight, usesGreedyWords } from "../analysis/text-flow-admission.ts";

export function textExpr(n: TextNode, ctx: ColorCtx & { mode: EmitMode; fontMetrics: FontMetrics }): string[] {
  const runs = n.runs;
  if (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length)) note(n, "approximated: line division forced from the browser (native wraps differently)");
  if (ctx.mode === "app" && usesGreedyWords(n)) {
    const run = runs[0]!;
    const natural = naturalLineHeight(run.font, ctx.fontMetrics);
    const lineHeight = run.font.lineHeight ?? n.lineBox!.baselineStep;
    const leading = lineHeight - natural;
    const limits = n.width.kind === "hug" ? `, fitContent: true${n.minWidth === undefined ? "" : `, minWidth: ${num(Math.max(0, n.minWidth - n.padding[1] - n.padding[3]))}`}${n.maxWidth === undefined ? "" : `, maxWidth: ${num(Math.max(0, n.maxWidth - n.padding[1] - n.padding[3]))}`}` : "";
    const out = [`MarkswiftGreedyText(${str(run.text)}, font: ${fontExpr(run.font, ctx)}, color: ${colorExpr(run.color, ctx, n.id)}, fontSize: ${num(run.font.size)}, lineGap: ${num(leading)}${n.lineBox ? `, baselineStep: ${num(n.lineBox.baselineStep)}, nativeWeight: UIFont.Weight.${nativeTextWeight(run.font)}.rawValue` : ""}${limits})`];
    if (n.lineBox) return textLineBoxExpr(n, ctx.mode, out, leading, true);
    if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * lineHeight - 0.5) {
      out.push(`.padding(.vertical, ${num(leading / 2)})`);
    }
    return out;
  }
  // Gap runs paint nothing, so the whole-text decisions below — case, line height, shadow —
  // are taken from the runs that actually carry glyphs.
  const glyphs = runs.filter((r) => r.gap === undefined);
  // `.textCase` is a View modifier — it covers the whole Text, so it carries a transform only
  // when every run shares it; otherwise (and for `capitalize`, which has no case) the literal.
  const shared = glyphs.every((r) => r.transform === glyphs[0]?.transform) ? glyphs[0]?.transform : undefined;
  const viewCase = shared === "uppercase" || shared === "lowercase" ? shared : undefined;
  // Base writing direction. `.environment(\.layoutDirection, .rightToLeft)` is a layout key and
  // does not reach the bidi algorithm: measured, a `Text("Hi.")` renders identically with and
  // without it, dot on the right. CoreText takes the base level from the first strong character,
  // so an all-Latin paragraph in an RTL block needs one: U+200F RIGHT-TO-LEFT MARK, zero width,
  // which moves the trailing neutral to the left exactly as the browser does. (An RLE/PDF or
  // RLI/PDI pair measures the same and costs two runs instead of one.) Container order is
  // already measured, so the direction must not reach the node's frames.
  const parts = runs.map((r) => runExpr(r, n, viewCase === undefined, ctx));
  if (n.layoutDirection === "rtl") parts.unshift("Text.markswiftRTL");
  // A paragraph's runs go into an array, not a `Text + Text + …` chain. The chain is one
  // expression for the Swift type checker and its cost is superlinear in the number of terms:
  // measured against the iOS 18 SDK, 13 runs typecheck in 7.3 s, 14 exhaust the solver outright
  // ("unable to type-check this expression in reasonable time"), and a view holding twenty
  // ten-run paragraphs takes 35.7 s. The same runs handed to `Text.markswiftRuns` are 0.2 s at any
  // size, because each element is checked on its own against a known element type.
  const out: string[] = parts.length === 1 ? [parts[0]!] : [`Text.markswiftRuns([\n    ${parts.join(",\n    ")},\n])`];
  if (n.align !== "leading") out.push(`.multilineTextAlignment(.${n.align})`);
  if (n.lineLimit !== undefined) out.push(`.lineLimit(${n.lineLimit})`);
  if (n.truncate) out.push(".truncationMode(.tail)");
  const first = glyphs[0];
  // CSS `line-height` is leading, not a box height. The browser takes `line-height − (ascent +
  // descent)`, puts all of it between lines and half of it above the first line and below the
  // last (the half-leading). `.lineSpacing` is exactly the between-lines part, so that is where
  // the leading goes — in both modes, and in app mode whether or not the browser happened to
  // wrap, because the app's text wraps at its own width and in its own language.
  //
  // What it must never become is a pinned height. Tailwind's type scale sets a line-height with
  // every font-size (`--text-sm: 0.875rem; --text-sm--line-height: calc(1.25/0.875)`), so 89% of
  // the shadcn corpus lands here: a fixed height on all of it would freeze Dynamic Type and clip
  // the second line that a longer translation needs.
  const natural = first ? naturalLineHeight(first.font, ctx.fontMetrics) : 0;
  const leading = first?.font.lineHeight === undefined ? 0 : first.font.lineHeight - natural;
  if (leading >= 0.01 && (ctx.mode === "app" || n.lines > 1)) out.push(`.lineSpacing(${num(leading)})`);
  // Leading below the face's own line height cannot be reproduced: measured, SwiftUI clamps a
  // negative `.lineSpacing` to zero (a two-line `Text` at `.lineSpacing(-4)` is exactly as tall
  // as at zero). Fidelity still pins the browser's box, so only the line rhythm inside it drifts.
  if (leading <= -0.01 && n.lines > 1) note(n, `approximated: line-height ${num(natural + leading)} is tighter than the face's natural ${num(natural)} → lines cannot be compressed`);
  if (viewCase) out.push(`.textCase(.${viewCase})`);
  // `.shadow` is a View modifier too: one shadow for the whole text.
  const shadow = glyphs.find((r) => r.shadow)?.shadow;
  if (shadow) {
    if (shadow.color.a > 0) out.push(`.shadow(color: ${colorExpr(shadow.color, ctx, n.id)}, radius: ${num(shadow.blur / 2)}, x: ${num(shadow.x)}, y: ${num(shadow.y)})`);
    if (!glyphs.every((r) => r.shadow === undefined || JSON.stringify(r.shadow) === JSON.stringify(shadow))) note(n, "approximated: text-shadow of the first shadowed run applied to the whole text");
  }
  // Native soft wrapping is off when the browser did not wrap either (`text-wrap-mode: nowrap`,
  // `white-space: pre`), and in fidelity mode whenever the browser's line division is known: the
  // baked-in hard breaks of a wrapped paragraph, or the single line of one that fit. A font whose
  // advances come out wider then overflows its box the way the browser's would, instead of
  // re-flowing into an extra line inside a box sized for one and dragging the whole column.
  // Text that ends in an ellipsis — `text-overflow` or a line clamp — keeps a flexible width
  // instead: the ellipsis only appears when the box is narrower than the text.
  const clamped = n.lineLimit !== undefined && n.noWrap !== true;
  // App mode never bakes the measured breaks into the literal, so there only genuine `nowrap`
  // text may refuse to wrap; a wrapped paragraph would otherwise become one unwrappable line.
  const divided = n.noWrap === true || (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length));
  const noSoftWrap = !n.truncate && !clamped && (divided || (ctx.mode === "fidelity" && n.lines === 1));
  out.push(`.fixedSize(horizontal: ${noSoftWrap}, vertical: true)`);
  if (n.lineBox) return textLineBoxExpr(n, ctx.mode, out, leading, false,
    ctx.mode === "fidelity" && noSoftWrap && divided ? n.frame.w - n.padding[1] - n.padding[3] : undefined);
  // Mode difference — text box. Fidelity pins it to the browser's line box: native line heights
  // differ per font and would otherwise drift the whole vertical rhythm (HANDOFF §8.1). Once
  // soft wrapping is off the box is pinned in both axes, so glyphs that come out wider overflow
  // it without widening the parent stack. App lets the native metrics decide; alignment comes
  // from `frameModifier` when the node fills or has a fixed width.
  if (ctx.mode === "fidelity") {
    // A box the browser clipped (`max-height`, `overflow: hidden`) shows fewer lines than the
    // text has, and CSS keeps the ones it shows at the top. Every plain `Alignment` here is
    // vertically centred, which would show the bottom half of the first line and the top half
    // of the last. Text that fits stays centred: that is what reproduces the CSS half-leading
    // when the native line height differs from the declared one — and a line-clamped text
    // fits by construction, because `lineLimit` drops the rest before it is laid out.
    const written = 1 + runs.reduce((k, r) => k + (r.text.match(/\n/g)?.length ?? 0) + (r.breaks?.length ?? 0), 0);
    const shown = n.lineLimit === undefined ? written : Math.min(written, n.lineLimit);
    const align = textBoxAlignment(n, shown > n.lines || clipsFirstLine(n));
    // The measured width is pinned only for text the browser itself broke: there the box has to
    // stay where the division was measured. A single line that fit is held together by
    // `fixedSize` alone — pinning its width as well makes it inflexible inside a row that has
    // to share the width with something else (a `DisclosureGroup`'s chevron), and it is the
    // sibling, not the text, that then moves.
    const size = [noSoftWrap && divided ? `width: ${num(n.frame.w - n.padding[1] - n.padding[3])}` : "", `height: ${num(n.frame.h - n.padding[0] - n.padding[2])}`].filter(Boolean);
    out.push(`.frame(${size.join(", ")}, alignment: ${align})`);
  }
  // App mode — the other half of the leading. CSS puts half of it above the first line and half
  // below the last, which `.lineSpacing` (a between-lines value) does not, so without this the
  // block comes out one leading short and the whole column above it creeps up. Padding is the
  // form that survives Dynamic Type: it grows the box with the text instead of capping it.
  //
  // Only for a node whose measured box *is* the line box. A text node grouped between flow
  // children carries the union of its glyph boxes instead, which already excludes the
  // half-leading — the parent's measured spacing absorbed it — and a box the browser clipped
  // (`.sr-only`, `max-height`) is shorter than its text on purpose.
  else if (Math.abs(leading) >= 0.5 && n.frame.h - n.padding[0] - n.padding[2] >= n.lines * (natural + leading) - 0.5) {
    out.push(`.padding(.vertical, ${num(leading / 2)})`);
  }
  return out;
}

/** One run as a `Text` expression (every modifier here returns `Text`, so runs concatenate). */
function runExpr(r: TextRun, n: TextNode, literalTransform: boolean, ctx: ColorCtx & { mode: EmitMode }): string {
  // A gap run is pure advance; `Text.markswiftGap` in the support file explains the idiom. It is a
  // named call rather than the three chained calls inline because a `Text + Text + …` run
  // concatenation is one expression for the Swift type checker, and overload resolution for
  // `.font(.system(size:))` in every gap is enough to push a long paragraph over its budget.
  if (r.gap !== undefined) return `Text.markswiftGap(${num(r.gap)})`;
  let text = r.text;
  // Fidelity reproduces the browser's line division as hard breaks; the break consumed the
  // collapsible space at the boundary, so that space becomes the newline rather than preceding it.
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
    if (r.transform === "capitalize") note(n, "approximated: text-transform capitalize applied to the literal (no .textCase equivalent)");
    if (r.bound) note(n, "approximated: text-transform baked into a bound run's literal");
  }
  let e = r.href ? `Text.markswiftLink(${str(text)}, ${str(r.href)})` : `Text(verbatim: ${str(text)})`;
  e += `.font(${fontExpr(r.font, ctx)})`;
  if (r.italic) e += ".italic()";
  // `background-clip: text`: the paint is the glyph fill (`Text.foregroundStyle` takes any ShapeStyle).
  const paint = r.paint && r.paint.kind !== "image" && r.paint.kind !== "unsupported" ? paintExpr(r.paint, n.frame.w, n.frame.h, ctx, n.id) : undefined;
  if (r.paint && !paint) note(n, `approximated: background-clip text with a ${r.paint.kind} paint falls back to the text color`);
  e += `.foregroundStyle(${paint ?? colorExpr(r.color, ctx, n.id)})`;
  if (r.decoration) {
    const d = r.decoration;
    const pattern = d.style === "dotted" ? ".dot" : d.style === "dashed" ? ".dash" : undefined;
    if (d.style === "wavy" || d.style === "double") note(n, `approximated: text-decoration-style ${d.style} drawn solid`);
    const args = [pattern ? `pattern: ${pattern}` : "", d.color ? `color: ${colorExpr(d.color, ctx, n.id)}` : ""].filter(Boolean).join(", ");
    for (const line of d.lines) {
      if (line === "underline") e += `.underline(${args})`;
      else if (line === "line-through") e += `.strikethrough(${args})`;
      else note(n, "approximated: text-decoration-line overline has no SwiftUI form; dropped");
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
