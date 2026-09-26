/** Finish the text box, measured line placement, overlays and overflow policy. */
import { type LayoutNode } from "../model/layout.ts";
import { type TextNode, type SemBase, type SemNode } from "../model/semantic.ts";
import { round2 } from "../css/index.ts";
import { type SourceTextRun } from "./context.ts";
import { finish } from "./node-base.ts";
import { collapseOf, noWrap } from "./text-runs.ts";
import { trimRun, markLineBreaks, markBaselineShifts, inlineFragments, withInlineGaps } from "./text-layout.ts";
import { styleOf } from "./style.ts";
import { type BuiltTextRuns } from "./text-run-builder.ts";

export function finishTextNode(host: LayoutNode, runs: SourceTextRun[], base: SemBase, leaf: boolean, constructed: BuiltTextRuns, note: (s: string) => void): TextNode {
  const { out, built, painted, union } = constructed;
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
  markBaselineShifts(built, host, note);
  markLineBreaks(built);
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
  noteUnsupportedTextFlow(host, runs, note);
  const wm = host.styles["writing-mode"];
  if (wm && wm !== "horizontal-tb") note(`unmapped: writing-mode ${wm} → vertical text has no SwiftUI layout`);
  return finish(node);
}

/** CSS line breaking can look correct at capture width yet diverge when an app view resizes. */
function noteUnsupportedTextFlow(host: LayoutNode, runs: SourceTextRun[], note: (s: string) => void): void {
  const indent = host.styles["text-indent"];
  if (indent && !/^[+-]?0+(?:\.0+)?(?:[a-z%]+)?(?:\s+(?:hanging|each-line))*$/i.test(indent.trim())) {
    note(`approximated: text-indent: ${indent} → first-line indentation is not emitted by SwiftUI Text`);
  }
  for (const styles of [host.styles, ...runs.map(run => run.styleOf.styles)]) {
    const wordBreak = styles["word-break"];
    if (wordBreak && wordBreak !== "normal") {
      note(`approximated: word-break: ${wordBreak} → SwiftUI Text uses native line breaking; narrower-width reflow may differ`);
    }
    const overflowWrap = styles["overflow-wrap"];
    if (overflowWrap && overflowWrap !== "normal") {
      note(`approximated: overflow-wrap: ${overflowWrap} → SwiftUI Text uses native line breaking; narrower-width reflow may differ`);
    }
  }
}
