/** Inline gaps, fragments, line breaks and baseline placement. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun, type DiagnosticLevel } from "../model/semantic.ts";
import { type BundledFamilies } from "../model/fonts.ts";
import { round2, px } from "../css/index.ts";
import { type MeasuredTextRun } from "./context.ts";
import { fontOf } from "./typography.ts";
import { decorationOf, contains, textColorOf, collapseOf } from "./text-runs.ts";
import { edgeWidth, unionRect, insetsOf } from "./geometry.ts";

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
  const color = textColorOf(s);
  const run: TextRun = { text: " ", font: fontOf(s, families), color };
  const deco = decorationOf(s, color);
  if (deco) run.decoration = deco;
  const node: LayoutNode = {
    tag: "#text",
    attrs: {},
    styles: s,
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    text: " ",
    children: [],
  };
  return { run, node, styleOf: host, src: [-1] };
}

/** Padding + border on one side of an inline element: the advance it adds around its text. */
function inlineInset(el: LayoutNode, side: "left" | "right"): number {
  return round2(px(el.styles[`padding-${side}`]) + edgeWidth(el.styles, side));
}

/** A run that paints no glyphs; `font` and `color` follow its neighbour so the line metrics hold. */
function gapRun(neighbour: TextRun, gap: number): TextRun {
  return { text: "", font: neighbour.font, color: neighbour.color, gap };
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
  b.run.text = text;
  if (edge.source.startsWith("^")) b.src.splice(0, cut);
  else b.src.length = b.src.length - cut;
}

/** Unicode controls per computed `unicode-bidi` of an inline box: [ltr open, rtl open, close]. */
const BIDI_CONTROLS: Record<string, [string, string, string]> = {
  embed: ["\u202A", "\u202B", "\u202C"],
  isolate: ["\u2066", "\u2067", "\u2069"],
  "bidi-override": ["\u202D", "\u202E", "\u202C"],
  "isolate-override": ["\u2066\u202D", "\u2067\u202E", "\u202C\u2069"],
  plaintext: ["\u2068", "\u2068", "\u2069"],
};

/**
 * The bidi controls of an element's computed `unicode-bidi`, in its computed `direction`. Only inline boxes count:
 * Blink's UA sheet gives every block `isolate`, which CSS ignores on a block container. A text host keeps only the
 * override of `bidi-override`/`isolate-override` (it applies to the host's inline content); isolating the whole
 * paragraph would hide its strong characters from the base-direction rule. ponytail: a host's `plaintext` (base
 * direction per paragraph from its first strong character) is not mapped; Core Text takes it from the layout
 * direction. Map it with an FSI around the host's runs if a design needs it. `::marker` boxes get nothing: their
 * UA `isolate` would wrap list and `<summary>` markers, which stay raw (051's `counterOf`, controls.ts `MARKER`).
 */
function bidiOf(el: LayoutNode, host: boolean): { open: string; close: string } | undefined {
  if (el.tag === "::marker") return undefined;
  const value = el.styles["unicode-bidi"] ?? "normal";
  const c = host
    ? value.endsWith("override")
      ? BIDI_CONTROLS["bidi-override"]
      : undefined
    : el.styles["display"] === "inline"
      ? BIDI_CONTROLS[value]
      : undefined;
  return c && { open: c[el.styles["direction"] === "rtl" ? 1 : 0], close: c[2] };
}

/**
 * Computed `unicode-bidi` as Unicode controls around each element's runs: SwiftUI has no
 * per-run direction, and Core Text runs UAX #9 over the controls (LRI/RLI…PDI, LRO/RLO…PDF). The
 * direction is the computed one, which Chrome already resolved for `dir=auto` from the content.
 * Call after trimming and before `markLineBreaks`; the controls map to no source index.
 */
export function markBidi(built: MeasuredTextRun[], host: LayoutNode): void {
  const own = bidiOf(host, true);
  const edit = (b: MeasuredTextRun, s: string, end: boolean) => {
    if (!s) return;
    b.run.text = end ? b.run.text + s : s + b.run.text;
    const pad = Array.from(s, () => -1);
    b.src = end ? [...b.src, ...pad] : [...pad, ...b.src];
  };
  let open: LayoutNode[] = [];
  built.forEach((b, i) => {
    const chain = inlineChain(host, b.styleOf).filter((el) => bidiOf(el, false));
    let keep = 0;
    while (keep < open.length && open[keep] === chain[keep]) keep++;
    const prev = built[i - 1];
    if (prev)
      edit(
        prev,
        open
          .slice(keep)
          .reverse()
          .map((el) => bidiOf(el, false)!.close)
          .join(""),
        true,
      );
    edit(
      b,
      chain
        .slice(keep)
        .map((el) => bidiOf(el, false)!.open)
        .join(""),
      false,
    );
    open = chain;
  });
  const last = built[built.length - 1];
  if (!last) return;
  edit(
    last,
    open
      .reverse()
      .map((el) => bidiOf(el, false)!.close)
      .join(""),
    true,
  );
  if (own) {
    edit(built[0]!, own.open, false);
    edit(last, own.close, true);
  }
}

/**
 * The browser's line division, re-expressed as offsets into each run's laid-out text.
 *
 * A measured box is an inline *fragment*, not a line: Blink splits one at every collapsed
 * whitespace run that came from a source newline, so several boxes routinely share a line.
 * Fragments are grouped by their top edge; the first fragment of each line after the first is
 * a break, and the first output character at or after its raw index is where it goes. Only
 * fidelity bakes the breaks into the output; its emitter reports that.
 *
 * A wrap can also fall exactly at a run boundary (before an `<a>` or `<strong>`): that run's own
 * boxes hold no break, and CDP omits `lines` for a single-line node. Its first baseline is then
 * below the previous run's last one — baselines, because top edges differ on a shared line when
 * font sizes do; a `vertical-align` shift is added back first, so call after `markBaselineShifts`.
 */
export function markLineBreaks(built: MeasuredTextRun[]): void {
  let prev: Rect | undefined;
  let prevShift = 0;
  let explicit = false;
  for (const b of built) {
    // A whitespace-only run (`<br>`, a collapsed space) has no glyph box; a newline in it is
    // already the break, so the run after it must not add a second.
    if (!/[^ \t\r\n\f]/.test(b.run.text)) {
      if (b.run.text.includes("\n")) explicit = true;
      continue;
    }
    const boxes = b.node.lines ?? [{ bounds: b.node.bounds, start: 0, length: b.node.text?.length ?? 0 }];
    const ordered = [...boxes].sort((p, q) => p.bounds.y - q.bounds.y || p.bounds.x - q.bounds.x);
    const starts: typeof ordered = [];
    let lineTop = -Infinity;
    for (const box of ordered) {
      // Half a line box of tolerance: fragments of one line share a top, subscripts do not.
      if (Math.abs(box.bounds.y - lineTop) < Math.max(1, box.bounds.h / 2)) continue;
      lineTop = box.bounds.y;
      starts.push(box);
    }
    const first = starts[0]?.bounds;
    // A run without a measured box says nothing about where its line is.
    if (!first || first.h <= 0) continue;
    const breaks: number[] = [];
    const shift = b.run.baselineOffset ?? 0;
    if (prev && !explicit && !/^[ \t]*\n/.test(b.run.text)) {
      const drop = first.y + ASCENT_RATIO * first.h + shift - (prev.y + ASCENT_RATIO * prev.h + prevShift);
      // A collapsible space the wrap consumed becomes the newline; offset 0 would indent the line.
      const at = b.run.text.startsWith(" ") && collapseOf(b.styleOf.styles) !== "preserve" ? 1 : 0;
      if (drop >= Math.max(2, first.h * 0.05, prev.h * 0.05) && at < b.run.text.length) breaks.push(at);
    }
    for (const box of starts.slice(1)) {
      const at = b.src.findIndex((i) => i >= box.start);
      // A preserved segment break already starts the line; a second one would double it.
      if (at > 0 && b.run.text[at - 1] === "\n") continue;
      if (at > 0 && at < b.run.text.length && breaks[breaks.length - 1] !== at) breaks.push(at);
    }
    prev = starts[starts.length - 1]!.bounds;
    prevShift = shift;
    explicit = /\n[ \t]*$/.test(b.run.text);
    if (breaks.length) b.run.breaks = breaks;
  }
}

/**
 * `vertical-align` on an inline run (`<sub>`, `<sup>`, `vertical-align: super`) as a baseline
 * offset in px. The shift is measured against the nearest run on the same line that sits on the
 * host's own baseline, so a UA-defined keyword needs no table.
 */
export function markBaselineShifts(
  built: MeasuredTextRun[],
  host: LayoutNode,
  note: (level: DiagnosticLevel, feature: string, message: string) => void,
): void {
  const shifted = built.filter((b) => {
    const el = b.styleOf;
    const va = el.styles["vertical-align"];
    return el !== host && ((va !== undefined && va !== "baseline") || el.tag === "sub" || el.tag === "sup");
  });
  if (!shifted.length) return;
  const hostSize = round2(px(host.styles["font-size"]));
  for (const b of shifted) {
    // Same line: the boxes overlap vertically. Same baseline: the host's font size.
    const ref = built.find(
      (o) =>
        o !== b &&
        o.run.font.size === hostSize &&
        o.node.bounds.y < b.node.bounds.y + b.node.bounds.h &&
        b.node.bounds.y < o.node.bounds.y + o.node.bounds.h,
    );
    if (!ref) {
      note("approximated", "vertical-align", "baseline-shifted run without unshifted text on its line → shift dropped");
      continue;
    }
    const a = ref.node.bounds;
    const s = b.node.bounds;
    const offset = round2(a.y + ASCENT_RATIO * a.h - (s.y + ASCENT_RATIO * s.h));
    if (Math.abs(offset) >= 0.5) b.run.baselineOffset = offset;
  }
}
