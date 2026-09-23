/** Construct semantic text nodes from measured inline runs. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextNode, type SemBase, type TextRun, type SemNode } from "../model/semantic.ts";
import { parseDeclared, parseColor, fontFamilies, round2, px, parseShadows } from "../css/index.ts";
import { type SourceTextRun, type InferenceContext, type MeasuredTextRun } from "./context.ts";
import { makeBase, finish } from "./node-base.ts";
import { type Collapse, collapseOf, normalizeWhitespace, decorationOf, noWrap } from "./text-runs.ts";
import { hostSpace, inlineChain, trimRun, markLineBreaks, markBaselineShifts, inlineFragments, withInlineGaps } from "./text-layout.ts";
import { fontOf, SYSTEM_DESIGNS } from "./typography.ts";
import { textPaintOf, styleOf } from "./style.ts";
import { EDGES, edgeWidth, unionRect } from "./geometry.ts";

/** `font-variant-numeric` values SwiftUI can request; everything else is reported. */
const NUMERIC_FEATURES: Record<string, true> = { normal: true, "tabular-nums": true };

/**
 * @param leaf  the host holds nothing but this text → its box is the CSS line box (text-node
 *              boxes from DOMSnapshot are glyph areas and overshoot tight line-heights).
 */
export function buildText(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, leaf = false): TextNode {
  // A leaf owns its element's box, padding and decoration. Runs grouped between flow children
  // are only the text: the host's decoration belongs to the host container.
  const base: SemBase = leaf
    ? makeBase(host, ctx, parseDeclared(host.attrs["style"]))
    : { id: host.id ? `${host.id}#text` : "", frame: host.bounds, width: { kind: "hug" }, height: { kind: "hug" }, padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [] };
  const notes = base.notes;
  const out: TextRun[] = [];
  const built: MeasuredTextRun[] = [];
  const painted: LayoutNode[] = [];
  let union: Rect | undefined;
  let pendingSpace = false;
  let prevRun: SourceTextRun | undefined;
  const noted: Record<string, true> = {};
  const note = (s: string) => {
    if (!noted[s]) notes.push(s);
    noted[s] = true;
  };
  for (const r of runs) {
    const s = r.styleOf.styles;
    const mode: Collapse = r.node.tag === "br" ? "preserve" : collapseOf(s);
    const normalized = normalizeWhitespace(r.node.tag === "br" ? "\n" : (r.node.text ?? ""), mode);
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
      if (prev && prevRun && r.node.tag !== "br" && !/\s$/.test(prev.text) && !text.startsWith(" ")) {
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
  if (out[0] && collapseOf(runs[0]!.styleOf.styles) === "collapse") trimRun(built[0]!, /^\s+/);
  if (built.length && collapseOf(runs[runs.length - 1]!.styleOf.styles) === "collapse") trimRun(built[built.length - 1]!, /\s+$/);
  const frame = leaf ? host.bounds : (union ?? host.bounds);
  // `start`/`end` follow the writing direction; the emitter has no direction, so resolve here.
  const dir = host.styles["direction"] === "rtl" ? "rtl" : "ltr";
  const ta = host.styles["text-align"] ?? "start";
  const side = ta === "start" ? (dir === "rtl" ? "right" : "left") : ta === "end" ? (dir === "rtl" ? "left" : "right") : ta;
  const first = out[0]?.font;
  const lh = first?.lineHeight ?? (first ? first.size * 1.2 : 16);
  // Glyph union over the line height; a clipped host (line clamp, overflow) shows fewer lines.
  let lines = Math.max(1, Math.round((union?.h ?? frame.h) / lh));
  if (leaf) lines = Math.min(lines, Math.max(1, Math.round((frame.h - base.padding[0] - base.padding[2]) / lh)));
  if (leaf) {
    // A box taller than its line boxes: the browser keeps the text at the top (block flow) or
    // where the flex container aligns it. The surplus becomes padding so the text lands there
    // in both modes; a centred host stays as is (the emitter centres text in its box).
    const [pt, pr, pb, pl] = base.padding;
    const surplus = round2(frame.h - pt - pb - lines * lh);
    const ai = /flex|-webkit-box/.test(host.styles["display"] ?? "") ? host.styles["align-items"] : undefined;
    if (surplus > 2 && ai !== "center") {
      base.padding = ai === "flex-end" || ai === "end" ? [pt + surplus, pr, pb, pl] : [pt, pr, pb + surplus, pl];
    }
  }
  // A fixed height that is exactly the text's own line boxes plus the padding it already carries
  // is not an independent height — the box is that tall *because* the text is. Keeping it as a
  // measured `fixed` makes app mode emit `.frame(height:)` on the label (a `<th class="h-10">`
  // whose single line is 20px, a chart tick), which is the one thing a shipped view must not do
  // to text: at a larger Dynamic Type size the glyphs grow and the frame does not. Hugging costs
  // nothing in fidelity, where the emitter pins the same height on the `Text` itself. A box the
  // browser clipped (`.sr-only`, `max-height`) is *shorter* than its text and keeps its frame.
  if (leaf && base.height.kind === "fixed" && Math.abs(base.height.px - base.padding[0] - base.padding[2] - lines * lh) < 0.5) {
    base.height = { kind: "hug" };
  }
  markLineBreaks(built, note);
  markBaselineShifts(built, host, note);
  // An inline element with its own background or border cannot be expressed as a run — SwiftUI
  // has no per-run box. Its measured inline box becomes a background layer instead, so the
  // highlight or key cap lands exactly where the browser painted it. An inline box that wrapped
  // was painted once per line, not once overall (`box-decoration-break: slice`), so it becomes
  // one layer per line; otherwise a long wrapped `<code>` would flood the whole paragraph
  // rectangle with its background.
  for (const el of painted) {
    const style = styleOf(el, []);
    const boxes = el.bounds.h > lh * 1.5 ? inlineFragments(el) : [el.bounds];
    boxes.forEach((b, i) => {
      const box: SemNode = {
        id: el.id ? (boxes.length > 1 ? `${el.id}#box${i}` : `${el.id}#box`) : "",
        kind: "box",
        frame: b,
        width: { kind: "fixed", px: round2(b.w) },
        height: { kind: "fixed", px: round2(b.h) },
        padding: [0, 0, 0, 0],
        style,
        confidence: "mapped",
        notes: [],
        overlays: [],
      };
      base.overlays.push({ node: finish(box), layer: "background", offset: [round2(b.x - frame.x), round2(b.y - frame.y)], covers: false });
    });
  }
  const node: TextNode = {
    ...base,
    frame,
    kind: "text",
    sourceTag: host.tag,
    runs: withInlineGaps(built, host),
    align:
      ta === "center" || (/flex/.test(host.styles["display"] ?? "") && host.styles["justify-content"] === "center")
        ? "center"
        : side === "right"
          ? "trailing"
          : "leading",
    lines,
  };
  const clamp = parseInt(host.styles["-webkit-line-clamp"] ?? "", 10);
  // No soft wrapping: one line per hard break (`pre`, `br`) — including the ones taken from the
  // browser's measured division, which are hard breaks in the emitted literal.
  if (Number.isFinite(clamp)) node.lineLimit = clamp;
  else if (noWrap(host.styles)) {
    node.noWrap = true;
    node.lineLimit = 1 + out.reduce((n, r) => n + (r.text.match(/\n/g)?.length ?? 0) + (r.breaks?.length ?? 0), 0);
  }
  if (host.styles["text-overflow"] === "ellipsis") node.truncate = true;
  // Only text needs the base writing direction: CoreText resolves neutral characters against it
  // (an RTL paragraph puts its trailing "." on the left). Container order is already measured,
  // so overriding the direction on a stack would mirror it a second time.
  if (dir === "rtl") node.layoutDirection = "rtl";
  if (ta === "justify") note("approximated: text-align: justify → ragged right (SwiftUI Text cannot justify)");
  const wm = host.styles["writing-mode"];
  if (wm && wm !== "horizontal-tb") note(`unmapped: writing-mode ${wm} → vertical text has no SwiftUI layout`);
  return finish(node);
}
