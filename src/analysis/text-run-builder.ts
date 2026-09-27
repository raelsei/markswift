/** Normalize measured source fragments and construct styled text runs. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun } from "../model/semantic.ts";
import { parseColor, fontFamilies, round2, px, parseShadows } from "../css/index.ts";
import { type SourceTextRun, type InferenceContext, type MeasuredTextRun } from "./context.ts";
import { type Collapse, collapseOf, normalizeWhitespace, decorationOf } from "./text-runs.ts";
import { hostSpace, inlineChain } from "./text-layout.ts";
import { fontOf, fontSelectionDiagnostic, SYSTEM_DESIGNS } from "./typography.ts";
import { textPaintOf } from "./style.ts";
import { unionRect } from "./geometry.ts";
import { applyInlineEffects, inlineBoxHasPaint } from "./inline-effects.ts";
import { linkDestinationLoss, nativeExternalURL } from "./link-destination.ts";
import { textSourceProjection, trimTextSource, prependInferredSource, omittedTextSource } from "./text-provenance.ts";
import type { TextRunSource } from "../model/text-source.ts";
import { DOCUMENT_WHITESPACE_ONLY, DOCUMENT_WHITESPACE_END } from "./document-whitespace.ts";

/** `font-variant-numeric` values SwiftUI can request; everything else is reported. */
const NUMERIC_FEATURES: Record<string, true> = { normal: true, "tabular-nums": true };

export interface BuiltTextRuns {
  out: TextRun[];
  built: MeasuredTextRun[];
  painted: LayoutNode[];
  union?: Rect;
  sourceAccounting?: TextRunSource;
}

export function buildTextRuns(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, note: (s: string) => void): BuiltTextRuns {
  const out: TextRun[] = [];
  const built: MeasuredTextRun[] = [];
  const painted: LayoutNode[] = [];
  let union: Rect | undefined;
  let pendingSpace = false;
  let prevRun: SourceTextRun | undefined;
  let sourceAccounting: TextRunSource | undefined;
  for (const r of runs) {
    const s = r.styleOf.styles;
    const boundary = r.node.tag === "br" ? "\n" : r.node.tag === "wbr" ? "\u200b" : undefined;
    if (r.node.tag === "wbr") note("approximated: <wbr> → zero-width break opportunity; native line breaking may differ");
    const mode: Collapse = boundary === undefined ? collapseOf(s) : "preserve";
    if (boundary === undefined && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(r.node.text ?? ""))
      note("approximated: control-character glyphs retain source literals; browser control-glyph synthesis is not reconstructed");
    if (mode === "preserve" && (r.node.text ?? "").includes("\r"))
      note("approximated: preserved DOM carriage-return layout is unproved; native control processing may differ");
    const normalized = normalizeWhitespace(boundary ?? (r.node.text ?? ""), mode);
    let text = normalized.text;
    let src = normalized.src;
    let source = textSourceProjection(r.node, text, src, mode);
    if (mode === "collapse") {
      // Collapsible whitespace merges across run boundaries; a whitespace-only run is just the
      // separator between its neighbours.
      const prev = out[out.length - 1];
      if (DOCUMENT_WHITESPACE_ONLY.test(text)) {
        if (prev && !DOCUMENT_WHITESPACE_END.test(prev.text)) pendingSpace = true;
        const omitted = omittedTextSource(r.node);
        if (omitted) {
          sourceAccounting ??= { version: 1, units: [], excluded: [], unavailable: [] };
          sourceAccounting.excluded.push(...omitted.excluded);
          sourceAccounting.unavailable.push(...omitted.unavailable);
        }
        continue;
      }
      if (text.startsWith(" ") && (!prev || DOCUMENT_WHITESPACE_END.test(prev.text))) {
        if (source) source = trimTextSource(source, 1, text.length);
        text = text.slice(1);
        src = src.slice(1);
      }
      // Snapshots may omit a whitespace-only text node between two inline elements; the laid-out
      // boxes (the inline element's, so its padding does not count) still show it as a gap on the
      // line, or as a break opportunity that wrapped.
      if (prev && prevRun && r.node.tag !== "br" && r.node.tag !== "wbr" && prevRun.node.tag !== "wbr" && !DOCUMENT_WHITESPACE_END.test(prev.text) && !text.startsWith(" ")) {
        const a = (prevRun.styleOf === host ? prevRun.node : prevRun.styleOf).bounds;
        const b = (r.styleOf === host ? r.node : r.styleOf).bounds;
        const sameLine = b.y < a.y + a.h - 1;
        if (!sameLine || b.x - (a.x + a.w) > 1.5) pendingSpace = true;
      }
    } else if (!text) continue;
    const color = parseColor(s["-webkit-text-fill-color"]) ?? parseColor(s["color"]) ?? { r: 0, g: 0, b: 0, a: 1 };
    const deco = decorationOf(s, color);
    // A collapsed space between two inline elements belongs to the text around them, not to
    // whichever element follows it: the browser does not underline the space between
    // `<del>…</del>` and `<ins>…</ins>`. It rides inside the next run's literal when that run
    // paints nothing over it, and stands alone in the host's own style when it does.
    if (pendingSpace && !text.startsWith(" ")) {
      if (deco && r.styleOf !== host) {
        const spaceRun = hostSpace(host, ctx.bundledFamilies);
        if (ctx.root.textSourceCapture) spaceRun.run.source = { version: 1, units: [{ output: [0, 1], sources: [], operation: "synthetic", reason: "inferred host separator without source ownership" }], excluded: [], unavailable: ["inferred separator source unavailable"] };
        out.push(spaceRun.run);
        built.push(spaceRun);
      } else {
        text = " " + text;
        src = [-1, ...src];
        if (source) source = prependInferredSource(source);
      }
    }
    pendingSpace = false;
    prevRun = r;
    const run: TextRun = { text, font: fontOf(s, ctx.bundledFamilies), color };
    const fontDiagnostic = fontSelectionDiagnostic(s, ctx.bundledFamilies);
    if (fontDiagnostic) note(fontDiagnostic);
    if (source) run.source = source;
    // The family the run ends up with: a design that ships a web font we do not bundle, or names
    // `cursive`/`fantasy`, silently gets SF Pro instead — the report has to say which family went.
    const families = fontFamilies(s["font-family"]);
    const resolved = families.find((f) => ctx.bundledFamilies[f] ?? SYSTEM_DESIGNS[f.toLowerCase()]);
    // The *first* family is the one the browser painted with; a later entry resolving is a
    // fallback, not a match. Reporting only the all-unresolvable case is how a whole design set
    // in a webfont stayed silent: `"Geist Variable", ui-sans-serif, system-ui` resolves — on
    // `ui-sans-serif`, three fallbacks down, while the reference pixels are Geist.
    const first = families[0];
    if (first !== undefined && !ctx.bundledFamilies[first] && !SYSTEM_DESIGNS[first.toLowerCase()]) {
      note(
        `approximated: font-family ${first} is a web font this run did not bundle → ${resolved === undefined ? "system default design" : `the fallback ${resolved} it names next`}; glyph advances differ from the reference`,
      );
    } else if (resolved !== undefined && /^(cursive|fantasy)$/i.test(resolved)) {
      note(`approximated: generic font-family ${resolved.toLowerCase()} has no system design → default`);
    } else if (resolved !== undefined) {
      // A non-default design is a substitution, not a match: `.monospaced`/`.serif`/`.rounded` are
      // the Apple system faces (SF Mono, New York, SF Pro Rounded), and no other engine resolves
      // a generic or `ui-*` family to them — Chrome on macOS answers Courier, Times and, because
      // it does not implement `ui-rounded`, plain SF Pro. The glyphs are right for the platform
      // and different from the reference, so every comparison against one has to know.
      const design = SYSTEM_DESIGNS[resolved.toLowerCase()];
      if (design && design !== "default") note(`approximated: font-family ${resolved} → SwiftUI .${design} design; glyph shapes and advances are the Apple system face, not the one the reference browser resolved`);
    }
    const ls = s["letter-spacing"];
    if (ls && ls !== "normal") run.kerning = round2(px(ls));
    const tt = s["text-transform"];
    if (tt === "uppercase" || tt === "lowercase" || tt === "capitalize") run.transform = tt;
    if (/^(italic|oblique)/.test(s["font-style"] ?? "")) run.italic = true;
    if (deco) run.decoration = deco;
    const shadows = parseShadows(s["text-shadow"]);
    if (shadows[0]) run.shadow = shadows[0];
    if (shadows.length > 1) note("approximated: multiple text-shadows → first only");
    const numeric = s["font-variant-numeric"] ?? "normal";
    if (/tabular-nums/.test(numeric)) run.tabularNums = true;
    for (const v of numeric.split(/\s+/)) if (v && !NUMERIC_FEATURES[v]) note(`approximated: font-variant-numeric ${v} has no SwiftUI API → default figures`);
    if (r.styleOf.attrs["class"]?.includes("sc-interp")) run.bound = true;
    const paint = textPaintOf(r.styleOf, r.node.bounds);
    if (paint) run.paint = paint;
    const el = r.styleOf;
    // An inline element painting its own box (`mark`'s background, `kbd`'s border) cannot be
    // carried by a run: SwiftUI has no per-run box. Collected for a background layer below.
    for (const inline of inlineChain(host, el)) {
      if (painted.includes(inline)) continue;
      if (inlineBoxHasPaint(inline)) painted.push(inline);
    }
    // Inline links remain in the paragraph's run order. A linked Text made from an
    // AttributedString preserves the per-run URL while the ordinary Text modifiers below
    // preserve its font, colour and decoration. Only schemes the native system can safely open
    // are emitted; a route/fragment needs an app-specific navigation action.
    const link = inlineChain(host, el).find((a) => a.tag === "a" && a.attrs["href"] !== undefined);
    if (link) {
      const href = link.attrs["href"]!;
      const destination = nativeExternalURL(href);
      if (destination) run.href = destination;
      else note(`approximated: inline <a href="${href}"> → styled text run, destination dropped (${linkDestinationLoss(href)})`);
      if (link.attrs["onclick"]) note("approximated: inline link onclick handler requires an app action");
    }
    applyInlineEffects(host, el, run, note);
    out.push(run);
    built.push({ run, node: r.node, styleOf: r.styleOf, src });
    union = union ? unionRect(union, r.node.bounds) : { ...r.node.bounds };
  }
  return { out, built, painted, union, ...(sourceAccounting ? { sourceAccounting } : {}) };
}
