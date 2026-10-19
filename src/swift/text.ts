import type { TextNode, TextRun } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
import type { EmitContext } from "./context.ts";
import { inlineImageView } from "./images.ts";
import { colorExpr, fontExpr, fontSizeExpr, nearestTextStyle, num, str } from "./format.ts";
import { paintExpr } from "./paint.ts";
import { note } from "./diagnostics.ts";
import { textBoxAlignment, clipsFirstLine, SYSTEM_LINE_HEIGHT } from "./text-box.ts";
import { surplusFloor } from "./frames.ts";

/**
 * Ascent, descent and natural line height of a run's face, as multiples of its size. System faces
 * and unpackaged families: SF Pro as the browser measures it on macOS (`hhea` 1980/432 per 2048)
 * and the native line height (`SYSTEM_LINE_HEIGHT`).
 */
function faceRatios(f: TextRun["font"], metrics: FontMetrics): { ascent: number; descent: number; natural: number } {
  const m = f.family.kind === "custom" ? metrics[f.family.name.toLowerCase()] : undefined;
  // ponytail: SF metrics of the converting Mac's Chrome (macOS 27); other macOS versions ship other SF builds.
  if (!m) return { ascent: 1980 / 2048, descent: 432 / 2048, natural: SYSTEM_LINE_HEIGHT };
  return {
    ascent: m.ascent / m.upem,
    descent: m.descent / m.upem,
    natural: (m.ascent + m.descent + m.lineGap) / m.upem,
  };
}

export function textExpr(n: TextNode, ctx: EmitContext): string[] {
  const runs = n.runs;
  // Whole-text decisions (case, line height, shadow) come from the runs that carry glyphs.
  const glyphs = runs.filter((r) => r.gap === undefined && !r.image);
  // `.textCase` covers the whole Text: only a transform every run shares; otherwise (and for
  // `capitalize`, which has no case) the literal.
  const shared = glyphs.every((r) => r.transform === glyphs[0]?.transform) ? glyphs[0]?.transform : undefined;
  const viewCase = shared === "uppercase" || shared === "lowercase" ? shared : undefined;
  // RTL base direction: `.environment(\.layoutDirection, .rightToLeft)` does not reach the bidi
  // algorithm, and CoreText takes the base level from the first strong character, so a leading
  // U+200F (RIGHT-TO-LEFT MARK) places trailing neutrals as the browser does.
  // A break baked into text with bidi controls (computed `unicode-bidi`) is U+2028 LINE SEPARATOR: a "\n" is a
  // UAX #9 paragraph separator, which ends every isolate and resolves each line on its own (X8), where the browser
  // resolves the paragraph once and reorders line by line. ponytail: only text with controls; plain RTL text keeps
  // "\n" (each line takes its base direction from its own first strong character). Make every break U+2028 after a
  // corpus render shows it moves nothing else.
  const lineBreak = runs.some((r) => /[\u202A-\u202E\u2066-\u2069]/.test(r.text)) ? "\u2028" : "\n";
  const parts = runs.map((r, i) => runExpr(r, i, n, viewCase === undefined, ctx, lineBreak));
  if (n.layoutDirection === "rtl") parts.unshift("Text.markswiftRTL");
  // An array, not a `Text + Text + …` chain: the chain's typecheck cost is superlinear (14 runs
  // exhaust the solver on the iOS 18 SDK); array elements are checked one at a time. A multi-line
  // part (an image run's view) indents as a block.
  const out: string[] =
    parts.length === 1
      ? parts[0]!.split("\n")
      : ["Text.markswiftRuns([", ...parts.flatMap((p) => `${p},`.split("\n").map((l) => `    ${l}`)), "])"];
  if (n.align !== "leading") out.push(`.multilineTextAlignment(.${n.align})`);
  if (n.lineLimit !== undefined) out.push(`.lineLimit(${n.lineLimit})`);
  if (n.truncate) out.push(".truncationMode(.tail)");
  const first = glyphs[0];
  // CSS `line-height` is leading, never a pinned height (that would freeze Dynamic Type). Fidelity
  // gives `.lineSpacing` the between-lines part; app mode uses `markswiftLineHeight` below.
  const natural = first ? first.font.size * faceRatios(first.font, ctx.fontMetrics).natural : 0;
  const leading = first?.font.lineHeight === undefined ? 0 : first.font.lineHeight - natural;
  if (leading >= 0.01 && ctx.mode === "fidelity" && n.lines > 1) out.push(`.lineSpacing(${num(leading)})`);
  // SwiftUI clamps a negative `.lineSpacing` to zero.
  if (leading <= -0.01 && n.lines > 1)
    note(
      n,
      "approximated",
      "line-height",
      ctx.mode === "app"
        ? `line-height ${num(natural + leading)} is tighter than the face's natural ${num(natural)} → lines compress on iOS 26+ only (iOS 18–25 clamps the spacing at 0)`
        : `line-height ${num(natural + leading)} is tighter than the face's natural ${num(natural)} → lines cannot be compressed`,
    );
  if (viewCase) out.push(`.textCase(.${viewCase})`);
  // `.shadow` is a View modifier too: one shadow for the whole text.
  const shadow = glyphs.find((r) => r.shadow)?.shadow;
  if (shadow) {
    if (shadow.color.a > 0)
      out.push(
        `.shadow(color: ${colorExpr(shadow.color, ctx, n.id)}, radius: ${num(shadow.blur / 2)}, x: ${num(shadow.x)}, y: ${num(shadow.y)})`,
      );
    if (!glyphs.every((r) => r.shadow === undefined || JSON.stringify(r.shadow) === JSON.stringify(shadow)))
      note(n, "approximated", "text-shadow", "text-shadow of the first shadowed run applied to the whole text");
  }
  // Soft wrapping is off for `nowrap` text, a single word CSS cannot break and, in fidelity,
  // whenever the browser's line division is known (baked-in breaks, or a single line that fit).
  // Ellipsised text (overflow or line clamp) keeps a flexible width. App mode never bakes breaks
  // into the literal.
  const clamped = n.lineLimit !== undefined && n.noWrap !== true;
  const divided = n.noWrap === true || (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length));
  // Only fidelity bakes the browser's line division into the literal.
  if (ctx.mode === "fidelity" && runs.some((r) => r.breaks?.length))
    note(n, "approximated", "text-wrap-mode", "line division forced from the browser (native wraps differently)");
  const noSoftWrap =
    !n.truncate && !clamped && (divided || n.unbreakable === true || (ctx.mode === "fidelity" && n.lines === 1));
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
    const size = [
      noSoftWrap && divided ? `width: ${num(n.frame.w - n.padding[1] - n.padding[3])}` : "",
      `height: ${num(n.frame.h - n.padding[0] - n.padding[2])}`,
    ].filter(Boolean);
    out.push(`.frame(${size.join(", ")}, alignment: ${align})`);
  }
  // App mode: CSS line boxes, scaling with Dynamic Type.
  else if (first?.font.lineHeight !== undefined) {
    const lh = first.font.lineHeight;
    const r = faceRatios(first.font, ctx.fontMetrics);
    const s = first.font.size;
    const args = [`${num(lh)}, size: ${num(s)}, relativeTo: .${nearestTextStyle(s)}`];
    // The browser's baseline: Blink rounds the face's ascent and descent to whole px and floors the
    // half-leading above the baseline, so the odd part of the leading lies below.
    const ascent = Math.round(r.ascent * s);
    const descent = Math.round(r.descent * s);
    const leadingPx = lh - ascent - descent;
    const below = descent + leadingPx - 2 * Math.floor(leadingPx / 2);
    args.push(`ascent: ${num(ascent / s)}, descent: ${num(below / s)}`);
    if (first.font.family.kind === "custom" && ctx.fontMetrics[first.font.family.name.toLowerCase()])
      args.push(`natural: ${num(r.natural)}`);
    // Half-leading only when the measured box is the line box (not a clipped box or a glyph-box
    // union between flow children) — the same test the padding used.
    if (n.frame.h - n.padding[0] - n.padding[2] < n.lines * lh - 0.5) args.push("halfLeading: false");
    // Tight leading the browser shows between lines stays compressed on iOS 26+; one-line text keeps natural lines
    // (its glyphs overflow the CSS line box), so its Text never reads as clipped.
    if (leading <= -0.01 && n.lines > 1) args.push("compressLines: true");
    // Uniform runs have a known line-height quantum; mixed-size/baseline runs retain native growth.
    if (runs.every((r) => r.font.size === s && !r.baselineOffset && !r.image) && lh % 1 !== 0)
      args.push("exactLineBox: true");
    out.push(`.markswiftLineHeight(${args.join(", ")})`);
    // ponytail: the native growth model is the iOS/macOS 26 `.lineHeight(.multiple)` one; on iOS
    // 18–25 `.lineSpacing` grows less (6 vs 10 pt for H₂O/mc² at 15/20), so there the line ends up
    // that much shorter than the browser's. Pass both growths into the helper if that path matters.
    // Padded growth is a `minHeight` floor in app mode (`surplusFloor`), which absorbs what native
    // text adds itself. Otherwise growth already in the box padding loses what native text adds
    // itself; unpadded growth is added for the part native text does not grow.
    if (n.lineBoxGrowth && !surplusFloor(n, ctx)) {
      const { edge, px, padded } = n.lineBoxGrowth;
      const g = (padded ? 0 : px) - Math.min(px, nativeInlineGrowth(glyphs, lh / first.font.size));
      if (Math.abs(g) >= 0.5) out.push(`.padding(.${edge}, ${num(g)})`);
    }
  }
  // App: `text-wrap: balance` keeps the native breaks but at the narrowest width that holds the line count.
  // ponytail: only text the browser wrapped; a single line Dynamic Type later wraps stays greedy.
  if (ctx.mode === "app" && n.balance && n.lines > 1) out.push(".markswiftBalance()");
  // In-app hrefs go to the view's action members; anything else (an absolute URL) opens as usual.
  const routes = new Map<string, string>();
  for (const r of runs) if (r.link?.action) routes.set(r.link.href, ctx.control?.actionOf.get(r.link.action.key) ?? "");
  if ([...routes.values()].some(Boolean))
    out.push(
      ".environment(\\.openURL, OpenURLAction { url in",
      "    switch url.absoluteString {",
      ...[...routes]
        .filter(([, name]) => name)
        .map(([href, name]) => `    case ${str(href)}: ${name}(); return .handled`),
      "    default: return .systemAction",
      "    }",
      "})",
    );
  return out;
}

/**
 * Growth `.lineHeight(.multiple(factor:))` gives a line whose runs are larger or shifted: measured
 * on macOS 26, every run spans `size + baselineOffset` above the baseline and `-baselineOffset`
 * below it, and the line is `factor ×` that span.
 */
function nativeInlineGrowth(glyphs: TextRun[], factor: number): number {
  const host = glyphs[0]!.font.size;
  const above = Math.max(host, ...glyphs.map((r) => r.font.size + (r.baselineOffset ?? 0)));
  const below = Math.max(0, ...glyphs.map((r) => -(r.baselineOffset ?? 0)));
  return factor * (above + below - host);
}

/** One run as a `Text` expression (every modifier here returns `Text`, so runs concatenate). */
function runExpr(
  r: TextRun,
  i: number,
  n: TextNode,
  literalTransform: boolean,
  ctx: EmitContext,
  lineBreak: string,
): string {
  // A gap run is pure advance; a named call keeps the run array cheap to typecheck.
  if (r.gap !== undefined) return `Text.markswiftGap(${num(r.gap)})`;
  if (r.image) {
    // A generated image rendered at its CSS size: `Text` takes only an `Image`. No pixels → keep its advance.
    // It carries its inline box's font like any run: without one it takes the environment's `.body` (17 pt
    // on iOS), whose taller line grows every line that holds the image.
    const view = inlineImageView(r.image, n, ctx);
    if (!view) return `Text.markswiftGap(${num(r.image.w)})`;
    const label = r.image.alt !== undefined ? `, label: ${str(r.image.alt)}` : "";
    let e = [
      `Text(Image.markswiftRendered(width: ${num(r.image.w)}, height: ${num(r.image.h)}${label}) {`,
      ...view.map((l) => `    ${l}`),
      `}).font(${fontExpr(r.font, ctx)})`,
    ].join("\n");
    if (ctx.mode === "fidelity" && r.breaks?.[0] === 0) e = `Text(verbatim: ${str(lineBreak)}) + ${e}`;
    if (r.baselineOffset !== undefined) e += `.baselineOffset(${num(r.baselineOffset)})`;
    return e;
  }
  let text = r.text;
  // Fidelity bakes the browser's line division in as hard breaks; the collapsible space at a
  // break becomes the newline — also when the break opens the next run (a wrap before `<a>`).
  if (ctx.mode === "fidelity" && r.breaks?.length) {
    let at = 0;
    let broken = "";
    for (const b of r.breaks) {
      broken += text.slice(at, text[b - 1] === " " ? b - 1 : b) + lineBreak;
      at = b;
    }
    text = broken + text.slice(at);
  }
  if (
    ctx.mode === "fidelity" &&
    text.endsWith(" ") &&
    n.runs.slice(i + 1).find((x) => x.gap === undefined)?.breaks?.[0] === 0
  )
    text = text.slice(0, -1);
  if (literalTransform && r.transform) {
    text = transformLiteral(text, r.transform);
    if (r.transform === "capitalize")
      note(
        n,
        "approximated",
        "text-transform: capitalize",
        "text-transform capitalize applied to the literal (no .textCase equivalent)",
      );
  }
  // A run's own slot key (`run2`) resolves it even when the node paints its colour twice; a
  // paint fallback colour is no enumerated slot, so it keeps the node-wide lookup.
  const fill = r.paint ? undefined : `run${i}`;
  // A Radix select's value text shows its Picker's choice.
  const live = n.runs.length === 1 ? ctx.control.textState.get(n.id) : undefined;
  let e = `Text(verbatim: ${live ?? str(text)})`;
  if (r.link) {
    // A link run takes one colour (it rides on the attributed string, `Text.markswiftLink`); a
    // gradient fill falls back to the run colour, else its first stop.
    const solid =
      r.color.a > 0 || !r.paint
        ? r.color
        : "stops" in r.paint
          ? (r.paint.stops[0]?.color ?? r.color)
          : r.paint.kind === "solid"
            ? r.paint.color
            : r.color;
    if (r.paint)
      note(
        n,
        "approximated",
        "background-clip: text",
        "inline link with background-clip: text → drawn in one solid colour (a link run takes one colour)",
      );
    e = `Text.markswiftLink(${str(text)}, ${str(r.link.href)}, ${colorExpr(solid, ctx, n.id, fill)})`;
  }
  e += `.font(${fontExpr(r.font, ctx)})`;
  if (r.italic) e += ".italic()";
  if (!r.link) {
    // `background-clip: text`: the paint is the glyph fill (`Text.foregroundStyle` takes any ShapeStyle).
    const paint =
      r.paint && r.paint.kind !== "image" && r.paint.kind !== "unsupported"
        ? paintExpr(r.paint, n.frame.w, n.frame.h, ctx, n.id)
        : undefined;
    if (r.paint && !paint)
      note(
        n,
        "approximated",
        "background-clip: text",
        `background-clip text with a ${r.paint.kind} paint falls back to the text color`,
      );
    e += `.foregroundStyle(${paint ?? colorExpr(r.color, ctx, n.id, fill)})`;
  }
  if (r.decoration) {
    const d = r.decoration;
    const pattern = d.style === "dotted" ? ".dot" : d.style === "dashed" ? ".dash" : undefined;
    if (d.style === "wavy" || d.style === "double")
      note(n, "approximated", "text-decoration-style", `text-decoration-style ${d.style} drawn solid`);
    const args = [
      pattern ? `pattern: ${pattern}` : "",
      d.color ? `color: ${colorExpr(d.color, ctx, n.id, `run${i}.dec`)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    for (const line of d.lines) {
      if (line === "underline") e += `.underline(${args})`;
      else if (line === "line-through") e += `.strikethrough(${args})`;
      else
        note(
          n,
          "approximated",
          "text-decoration-line: overline",
          "text-decoration-line overline has no SwiftUI form; dropped",
        );
    }
  }
  if (r.kerning !== undefined && r.kerning !== 0) {
    // App-mode text grows with Dynamic Type, so its tracking is the same share of the scaled size.
    const size = fontSizeExpr(r.font, ctx);
    e += `.kerning(${size === num(r.font.size) ? num(r.kerning) : `${size} * ${num(r.kerning)} / ${num(r.font.size)}`})`;
  }
  if (r.tabularNums) e += ".monospacedDigit()";
  if (r.baselineOffset !== undefined) e += `.baselineOffset(${num(r.baselineOffset)})`;
  return e;
}

/** CSS `text-transform` on a literal; `capitalize` uppercases the first letter of each word. */
function transformLiteral(text: string, t: NonNullable<TextRun["transform"]>): string {
  if (t === "uppercase") return text.toUpperCase();
  if (t === "lowercase") return text.toLowerCase();
  return text.replace(
    /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  );
}
