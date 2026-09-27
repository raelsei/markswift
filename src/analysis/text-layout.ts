/** Inline gaps, fragments, line breaks and baseline placement. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun } from "../model/semantic.ts";
import { type BundledFamilies } from "../model/fonts.ts";
import { parseColor, round2, px } from "../css/index.ts";
import { type MeasuredTextRun } from "./context.ts";
import { fontOf } from "./typography.ts";
import { decorationOf, contains, collapseOf } from "./text-runs.ts";
import { edgeWidth, unionRect, insetsOf } from "./geometry.ts";
import { trimTextSource } from "./text-provenance.ts";

/**
 * Fraction of a glyph box that sits above the baseline. DOMSnapshot text bounds are em boxes
 * (ascent + descent), so a run's baseline is this far down its box — which is how a run in a
 * smaller font can be compared with the text around it. SF Pro, Times and SF Mono agree to ~1%.
 */
const ASCENT_RATIO = 0.8;

/**
 * The horizontal padding and border of an inline element is advance the browser inserted around
 * its text, but a native run carries no box — so it becomes a run that paints nothing and only
 * advances the line. Nested inline elements contribute one gap each, at the point where their
 * first (or last) run sits, so `<a><code>x</code></a>` opens both boxes before the same glyph.
 */
export function withInlineGaps(built: MeasuredTextRun[], host: LayoutNode): TextRun[] {
  const chains = built.map((b) => inlineChain(host, b.styleOf));
  const out: TextRun[] = [];
  for (let i = 0; i < built.length; i++) {
    const b = built[i]!;
    const chain = chains[i]!;
    const lead = chain.filter((el) => !chains[i - 1]?.includes(el)).reduce((n, el) => n + inlineInset(el, "left"), 0);
    const trail = chain.filter((el) => !chains[i + 1]?.includes(el)).reduce((n, el) => n + inlineInset(el, "right"), 0);
    if (lead > 0) out.push(gapRun(b.run, lead));
    out.push(b.run);
    if (trail > 0) out.push(gapRun(b.run, trail));
  }
  return out;
}

/**
 * The collapsed space between two inline elements, as a run of the host's own text: its style,
 * and a text node of its own so the browser's measured line boxes — which belong to the real
 * text nodes — are not read twice.
 */
export function hostSpace(host: LayoutNode, families: BundledFamilies): MeasuredTextRun {
  const s = host.styles;
  const color = parseColor(s["-webkit-text-fill-color"]) ?? parseColor(s["color"]) ?? { r: 0, g: 0, b: 0, a: 1 };
  const run: TextRun = { text: " ", font: fontOf(s, families), color };
  const deco = decorationOf(s, color);
  if (deco) run.decoration = deco;
  const node: LayoutNode = { tag: "#text", attrs: {}, styles: s, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: " ", children: [] };
  return { run, node, styleOf: host, src: [-1] };
}

/** Padding + border on one side of an inline element: the advance it adds around its text. */
function inlineInset(el: LayoutNode, side: "left" | "right"): number {
  return round2(px(el.styles[`padding-${side}`]) + edgeWidth(el.styles, side));
}

/** A run that paints no glyphs; `font` and `color` follow its neighbour so the line metrics hold. */
function gapRun(neighbour: TextRun, gap: number): TextRun {
  return { text: "", font: neighbour.font, color: neighbour.color, gap,
    ...(neighbour.source ? { source: { version: 1 as const, units: [{ output: [0, 0] as [number, number], operation: "synthetic" as const, sources: [], reason: "inline box advance without source characters" }], excluded: [], unavailable: ["native inline-gap geometry unavailable"] } } : {}) };
}

/** The inline elements from `host` (exclusive) down to `el` (inclusive), outermost first. */
export function inlineChain(host: LayoutNode, el: LayoutNode): LayoutNode[] {
  const path: LayoutNode[] = [];
  let cur = host;
  while (cur !== el) {
    const next = cur.children.find((c) => c === el || contains(c, el));
    if (!next) return path;
    path.push(next);
    cur = next;
  }
  return path;
}

/**
 * The boxes a wrapped inline element was painted in: one per line it spans. The measured text
 * fragments inside it are the content areas, so each line's box is their union grown by the
 * element's padding and border — vertically on every line, horizontally only where the box
 * actually opens and closes (`box-decoration-break: slice`, the CSS default).
 */
export function inlineFragments(el: LayoutNode): Rect[] {
  const frags: Rect[] = [];
  const collect = (n: LayoutNode): void => {
    if (n.tag === "#text") {
      if (n.lines?.length) for (const l of n.lines) frags.push(l.bounds);
      else if (n.bounds.w > 0) frags.push(n.bounds);
      return;
    }
    for (const c of n.children) collect(c);
  };
  collect(el);
  if (!frags.length) return [el.bounds];
  const lines: Rect[] = [];
  for (const f of frags.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    // Half a fragment of tolerance: fragments of one line share a top, a nested smaller font does not.
    if (last && f.y - last.y < Math.max(1, f.h / 2)) lines[lines.length - 1] = unionRect(last, f);
    else lines.push({ ...f });
  }
  const [pt, pr, pb, pl] = insetsOf(el.styles);
  return lines.map((g, i) => ({
    x: i === 0 ? g.x - pl : g.x,
    y: g.y - pt,
    w: g.w + (i === 0 ? pl : 0) + (i === lines.length - 1 ? pr : 0),
    h: g.h + pt + pb,
  }));
}

/** Drops the whitespace `edge` matches from a run, keeping its source map aligned. */
export function trimRun(b: MeasuredTextRun, edge: RegExp): void {
  const text = b.run.text.replace(edge, "");
  const cut = b.run.text.length - text.length;
  if (!cut) return;
  if (b.run.source) b.run.source = trimTextSource(b.run.source, edge.source.startsWith("^") ? cut : 0, edge.source.startsWith("^") ? b.run.text.length : text.length);
  b.run.text = text;
  if (edge.source.startsWith("^")) b.src.splice(0, cut);
  else b.src.length = b.src.length - cut;
}

/**
 * The browser's line division, re-expressed as offsets into each run's laid-out text.
 *
 * A measured box is an inline *fragment*, not a line: Blink splits one at every collapsed
 * whitespace run that came from a source newline, so several boxes routinely share a line.
 * Fragments are grouped by their top edge; the first fragment of each line after the first is
 * a break, and the first output character at or after its raw index is where it goes.
 */
export function markLineBreaks(built: MeasuredTextRun[]): void {
  let previousLine: Rect | undefined;
  let previousShift = 0;
  let previousMeasuredBaseline: number | undefined;
  let explicitBreak = false;
  for (const b of built) {
    // Boundary-only runs do not have glyph geometry. Keep an explicit newline across any
    // whitespace-only run; <wbr> supplies an opportunity, not a hard break of its own.
    if (!/[^\s\u200b]/u.test(b.run.text)) {
      if (b.run.text.includes("\n")) explicitBreak = true;
      continue;
    }
    const boxes = b.node.lines ?? [{ bounds: b.node.bounds, start: 0, length: b.node.text?.length ?? 0, baseline: b.node.firstBaseline }];
    const ordered = [...boxes].sort((p, q) => p.bounds.y - q.bounds.y || p.bounds.x - q.bounds.x);
    const starts: typeof ordered = [];
    let lineTop = -Infinity;
    for (const box of ordered) {
      // Half a line box of tolerance: fragments of one line share a top, subscripts do not.
      if (Math.abs(box.bounds.y - lineTop) < Math.max(1, box.bounds.h / 2)) continue;
      lineTop = box.bounds.y;
      starts.push(box);
    }
    const breaks: number[] = [];
    const first = starts[0]?.bounds;
    // CDP omits `lines` for a single-line text node. A new line can therefore start at the
    // first character of a separate styled run, even though that run has no internal break.
    // Compare baselines, including the measured vertical-align shift. Top edges differ on a
    // shared baseline when font sizes differ; glyph boxes can overlap across genuine lines
    // when CSS sets a tight line-height. Horizontal order is irrelevant for RTL text.
    const shift = b.run.baselineOffset ?? 0;
    const baseline = first ? (starts[0]?.baseline ?? first.y + ASCENT_RATIO * first.h) + shift : undefined;
    const previousBaseline = previousLine ? (previousMeasuredBaseline ?? previousLine.y + ASCENT_RATIO * previousLine.h) + previousShift : undefined;
    const tolerance = Math.max(2, (first?.h ?? 0) * 0.05, (previousLine?.h ?? 0) * 0.05);
    if (baseline !== undefined && previousBaseline !== undefined && baseline - previousBaseline >= tolerance && !explicitBreak && !/^[ \t]*\n/.test(b.run.text)) {
      // A collapsible leading space was consumed by this wrap. Replacing it with the newline
      // uses the existing emitter's space-at-boundary rule; offset zero would leave an indent.
      const at = collapseOf(b.styleOf.styles) !== "preserve" && b.run.text.startsWith(" ") ? 1 : 0;
      if (at < b.run.text.length) breaks.push(at);
    }
    for (const box of starts.slice(1)) {
      const at = b.src.findIndex((i) => i >= box.start);
      // A preserved segment break already starts the line; a second one would double it.
      if (at > 0 && b.run.text[at - 1] === "\n") continue;
      if (at > 0 && at < b.run.text.length && breaks[breaks.length - 1] !== at) breaks.push(at);
    }
    previousLine = starts[starts.length - 1]?.bounds ?? previousLine;
    previousMeasuredBaseline = starts.at(-1)?.baseline;
    previousShift = shift;
    explicitBreak = /\n[ \t\u200b]*$/.test(b.run.text);
    if (breaks.length) b.run.breaks = breaks;
  }
}

/**
 * `vertical-align` on an inline run (`<sub>`, `<sup>`, `vertical-align: super`) as a baseline
 * offset in px. The shift is measured against the nearest run on the same line that sits on the
 * host's own baseline, so a UA-defined keyword needs no table.
 */
export function markBaselineShifts(built: MeasuredTextRun[], host: LayoutNode, note: (s: string) => void): void {
  const shifted = built.filter((b) => {
    const el = b.styleOf;
    const va = el.styles["vertical-align"];
    return el !== host && ((va !== undefined && va !== "baseline") || el.tag === "sub" || el.tag === "sup");
  });
  if (!shifted.length) return;
  const hostSize = round2(px(host.styles["font-size"]));
  for (const b of shifted) {
    // Same line: the boxes overlap vertically. Same baseline: the host's font size.
    const ref = built.find((o) => o !== b && o.run.font.size === hostSize && o.node.bounds.y < b.node.bounds.y + b.node.bounds.h && b.node.bounds.y < o.node.bounds.y + o.node.bounds.h);
    if (!ref) {
      note("approximated: baseline-shifted run without unshifted text on its line → shift dropped");
      continue;
    }
    const a = ref.node.bounds;
    const s = b.node.bounds;
    const offset = round2((ref.node.firstBaseline ?? a.y + ASCENT_RATIO * a.h) - (b.node.firstBaseline ?? s.y + ASCENT_RATIO * s.h));
    if (Math.abs(offset) >= 0.5) b.run.baselineOffset = offset;
  }
}
