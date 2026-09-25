/** Normalize measured source fragments and construct styled text runs. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun } from "../model/semantic.ts";
import { parseColor, fontFamilies, round2, px, parseShadows } from "../css/index.ts";
import { type SourceTextRun, type InferenceContext, type MeasuredTextRun } from "./context.ts";
import { type Collapse, collapseOf, normalizeWhitespace, decorationOf } from "./text-runs.ts";
import { hostSpace, inlineChain } from "./text-layout.ts";
import { fontOf, SYSTEM_DESIGNS } from "./typography.ts";
import { textPaintOf } from "./style.ts";
import { EDGES, edgeWidth, unionRect } from "./geometry.ts";

/** `font-variant-numeric` values SwiftUI can request; everything else is reported. */
const NUMERIC_FEATURES: Record<string, true> = { normal: true, "tabular-nums": true };

export interface BuiltTextRuns {
  out: TextRun[];
  built: MeasuredTextRun[];
  painted: LayoutNode[];
  union?: Rect;
}

export function buildTextRuns(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, note: (s: string) => void): BuiltTextRuns {
  const out: TextRun[] = [];
  const built: MeasuredTextRun[] = [];
  const painted: LayoutNode[] = [];
  let union: Rect | undefined;
  let pendingSpace = false;
  let prevRun: SourceTextRun | undefined;
  for (const r of runs) {
    const s = r.styleOf.styles;
    const boundary = r.node.tag === "br" ? "\n" : r.node.tag === "wbr" ? "\u200b" : undefined;
    if (r.node.tag === "wbr") note("approximated: <wbr> → zero-width break opportunity; native line breaking may differ");
    const mode: Collapse = boundary === undefined ? collapseOf(s) : "preserve";
    const normalized = normalizeWhitespace(boundary ?? (r.node.text ?? ""), mode);
    let text = normalized.text;
    let src = normalized.src;
    if (mode === "collapse") {
      // Collapsible whitespace merges across run boundaries; a whitespace-only run is just the
      // separator between its neighbours.
      const prev = out[out.length - 1];
      if (!text.trim()) {
        if (prev && !/\s$/.test(prev.text)) pendingSpace = true;
        continue;
      }
      if (text.startsWith(" ") && (!prev || /\s$/.test(prev.text))) {
        text = text.slice(1);
        src = src.slice(1);
      }
      // Snapshots may omit a whitespace-only text node between two inline elements; the laid-out
      // boxes (the inline element's, so its padding does not count) still show it as a gap on the
      // line, or as a break opportunity that wrapped.
      if (prev && prevRun && r.node.tag !== "br" && r.node.tag !== "wbr" && prevRun.node.tag !== "wbr" && !/\s$/.test(prev.text) && !text.startsWith(" ")) {
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
        out.push(spaceRun.run);
        built.push(spaceRun);
      } else {
        text = " " + text;
        src = [-1, ...src];
      }
    }
    pendingSpace = false;
    prevRun = r;
    const run: TextRun = { text, font: fontOf(s, ctx.bundledFamilies), color };
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
    if (el !== host && !painted.includes(el)) {
      const bg = parseColor(el.styles["background-color"]);
      if ((bg && bg.a > 0) || EDGES.some((e) => edgeWidth(el.styles, e) > 0)) painted.push(el);
    }
    // A link inside a sentence never reaches `controlOf` — it is an inline element, so it arrives
    // here as a run and leaves as decoration. SwiftUI's `Text` has no per-run destination (an
    // `AttributedString` link would, but then the whole paragraph stops being a run chain), so
    // the navigation is genuinely lost; what must not be lost is the record of losing it. This is
    // the most common link form in prose, and it used to report nothing at all.
    const link = inlineChain(host, el).find((a) => a.tag === "a" && (a.attrs["href"] ?? "") !== "");
    if (link) note(`approximated: inline <a href="${link.attrs["href"]}"> → styled text run, destination dropped (Text has no per-run link)`);
    out.push(run);
    built.push({ run, node: r.node, styleOf: r.styleOf, src });
    union = union ? unionRect(union, r.node.bounds) : { ...r.node.bounds };
  }
  return { out, built, painted, union };
}
