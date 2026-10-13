/** Flow, float, stack and grid layout inference. */
import {
  type SemBase,
  type CrossAlign,
  type Distribution,
  type StackNode,
  type TextRun,
  type TextNode,
  type Axis,
  addDiagnostic,
} from "../model/semantic.ts";
import { type Rect } from "../model/layout.ts";
import { px, round2 } from "../css/index.ts";
import { type AnalyzedChild } from "./context.ts";
import { floating, lineTops, renders, hangsLeading, fillsWidthInside } from "./geometry.ts";
import { finish } from "./node-base.ts";

/** Horizontal overlap of more than 1px: a float over a box it shortens the line boxes of. */
function overlapsX(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1;
}

/**
 * A float's neighbour, split where its lines clear the float.
 *
 * The neighbour is one box whose line boxes start at two different left edges: the ones the
 * float excludes, and the ones below it, which run the container's full width. A SwiftUI `Text`
 * has a single box, so keeping them together straightens the ragged edge out — the narrow lines
 * run over the float, whether the division comes from the browser (fidelity) or from native
 * wrapping (app). The clearing lines therefore become their own block under the row, where the
 * browser put them; what is lost is re-wrapping at another width, which the row already notes.
 *
 * Returns the replacement for the whole row — a vertical stack of the shortened row and the
 * lifted lines — or undefined when nothing clears the float or the measured division cannot be
 * split (mixed inline styles, a clamped or truncating box, a division that is not the measured one).
 */
function liftClearedText(
  base: SemBase,
  items: AnalyzedChild[],
  align: CrossAlign,
  distribution: Distribution,
): StackNode | undefined {
  for (const it of items) {
    const sem = it.sem;
    if (floating(it.node) || sem.kind !== "text" || sem.lineLimit !== undefined || sem.truncate) continue;
    // Only a box the float overlaps had its lines shortened instead of its width: a flex item's
    // computed `float` survives even though flex layout ignores it, and it sits clear of its row.
    const over = items.filter((f) => floating(f.node) && overlapsX(f.sem.frame, sem.frame));
    // Where each line after the first begins, as a (run, offset into its text) pair: a run's
    // `breaks` are the boundaries inside it, and the runs are in document order.
    const bounds: Array<[number, number]> = [];
    sem.runs.forEach((r, i) => {
      for (const b of r.breaks ?? []) bounds.push([i, b]);
    });
    const tops = lineTops(it.node);
    // The division has to be the measured one: one forced break per line boundary, over as many
    // lines as the node was built with (an already split node carries fewer than it measured).
    // A boundary that fell between two runs was never recorded, and shows up as a count mismatch.
    if (!over.length || !bounds.length || tops.length !== bounds.length + 1 || tops.length !== sem.lines) continue;
    // The exclusion ends at the float's margin box; a line level with that is already clear.
    const ends = Math.max(...over.map((f) => f.sem.frame.y + f.sem.frame.h + px(f.node.styles["margin-bottom"])));
    const cut = tops.findIndex((y, i) => i > 0 && y >= ends - 0.5);
    if (cut < 1) continue;
    const [ri, at] = bounds[cut - 1]!;
    const pitch = (tops[tops.length - 1]! - tops[0]!) / (tops.length - 1);
    const [pt, pr, pb, pl] = sem.padding;
    const split = sem.runs[ri]!;
    // The break consumed the collapsible space at the boundary — `runExpr` drops it the same way.
    const head: TextRun = { ...split, text: split.text.slice(0, split.text[at - 1] === " " ? at - 1 : at) };
    const inHead = (split.breaks ?? []).filter((b) => b < at);
    if (inHead.length) head.breaks = inHead;
    else delete head.breaks;
    const tail: TextRun = { ...split, text: split.text.slice(at) };
    const inTail = (split.breaks ?? []).filter((b) => b > at).map((b) => b - at);
    if (inTail.length) tail.breaks = inTail;
    else delete tail.breaks;
    const headRuns = [...sem.runs.slice(0, ri), head];
    const tailRuns = [tail, ...sem.runs.slice(ri + 1)];
    const shapedH = round2(pt + cut * pitch);
    const shaped: TextNode = {
      ...sem,
      runs: headRuns,
      frame: { ...sem.frame, h: shapedH },
      padding: [pt, pr, 0, pl],
      lines: cut,
    };
    const cleared: TextNode = {
      ...sem,
      id: sem.id ? `${sem.id}#cleared` : "",
      runs: tailRuns,
      frame: { ...sem.frame, y: round2(sem.frame.y + shapedH), h: round2(sem.frame.h - shapedH) },
      padding: [0, pr, pb, pl],
      lines: tops.length - cut,
      diagnostics: [...sem.diagnostics],
      overlays: [],
    };
    const rowItems: AnalyzedChild[] = items.map((i) => (i === it ? { node: i.node, sem: shaped } : i));
    const bottom = Math.max(...rowItems.map((i) => i.sem.frame.y + i.sem.frame.h));
    const rowBase: SemBase = {
      ...base,
      id: base.id ? `${base.id}/beside` : "",
      frame: { ...base.frame, h: round2(bottom - base.frame.y) },
      diagnostics: [],
      overlays: [],
    };
    const row = finish(stackOf(rowBase, "h", rowItems, align, distribution));
    const outer = stackOf(
      base,
      "v",
      [
        { node: it.node, sem: row },
        { node: it.node, sem: cleared },
      ],
      "stretch",
      "start",
    );
    addDiagnostic(
      outer.diagnostics,
      "approximated",
      "float",
      "float → row plus the lines that clear it; re-wrapped at another width the split lands elsewhere",
    );
    return outer;
  }
  return undefined;
}

/**
 * Stack geometry from measured child frames: spacing per adjacent pair (uniform when equal),
 * and the leading offset the base's padding does not explain. A float's neighbour overlaps its
 * box (the browser shortens line boxes instead of the block), so the gap is the float's margin;
 * a negative `margin-top` really does overlap, and negative spacing reproduces it.
 */
export function stackOf(
  base: SemBase,
  axis: Axis,
  all: AnalyzedChild[],
  align: CrossAlign,
  distribution: Distribution,
  flex = false,
): StackNode {
  const [pt, , , pl] = base.padding;
  const items = all.filter((i) => renders(i.node) && !hangsLeading(i.sem.frame, base.frame.x + pl));
  // A row whose text clears the float part-way down is two blocks, not one (see `liftClearedText`).
  if (axis === "h" && items.length > 1) {
    const lifted = liftClearedText(base, items, align, distribution);
    if (lifted) return lifted;
  }
  const gaps: number[] = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    let g =
      axis === "h" ? b.sem.frame.x - (a.sem.frame.x + a.sem.frame.w) : b.sem.frame.y - (a.sem.frame.y + a.sem.frame.h);
    if (g < -0.5) {
      if (axis === "h" && a.node.styles["float"] === "left") g = Math.max(0, px(a.node.styles["margin-right"]));
      else if (axis === "h" && b.node.styles["float"] === "right") g = Math.max(0, px(b.node.styles["margin-left"]));
      else if (axis === "v" && px(b.node.styles["margin-top"]) < -0.5) {
        // A card lifted onto a hero: the overlap is the design, not an approximation.
      } else {
        addDiagnostic(
          base.diagnostics,
          "approximated",
          axis === "h" ? "margin-left" : "margin-top",
          `children overlap by ${round2(-g)}px`,
        );
        g = 0;
      }
    } else g = Math.max(0, g);
    gaps.push(round2(g));
  }
  // `margin: auto` on a flex item takes the free space (`ml-auto`, `mt-auto`). Computed margins
  // are used px, so the capture keeps the authored `auto` (PreferredSize.autoMargins). Such a gap
  // becomes a Spacer whose minimum is what the margin did not add. Only with free space to take:
  // in block flow an auto vertical margin is 0, and a hugging box has none.
  const [before, after] = axis === "h" ? (["left", "right"] as const) : (["top", "bottom"] as const);
  const autoMargin = (it: AnalyzedChild | undefined, side: "top" | "right" | "bottom" | "left") =>
    it?.node.preferredSize?.autoMargins?.includes(side) ? px(it.node.styles[`margin-${side}`]) : undefined;
  const autoGaps: number[] = [];
  if (flex && (axis === "h" ? base.width : base.height).kind !== "hug") {
    for (let i = 0; i <= items.length; i++) {
      const a = autoMargin(items[i - 1], after),
        b = autoMargin(items[i], before);
      if (a === undefined && b === undefined) continue;
      autoGaps.push(i);
      if (i > 0 && i < items.length) gaps[i - 1] = round2(Math.max(0, gaps[i - 1]! - (a ?? 0) - (b ?? 0)));
    }
  }
  const uniform = gaps.every((g) => Math.abs(g - (gaps[0] ?? 0)) <= 0.5);
  const spacing = uniform ? round2(gaps[0] ?? 0) : gaps;

  // A float's in-flow neighbour keeps the container's full width: the browser shortens its line
  // boxes, not its box. Side by side in a row that box overflows the container — and pushes a
  // right-hand float off the edge — so a neighbour whose box the float overlaps is narrowed to
  // the width the exclusion left for its lines. The box is the approximation the row already
  // notes; the line boxes it carries are what the browser measured.
  if (axis === "h" && items.length > 1 && items.some((i) => floating(i.node))) {
    let taken = 0;
    items.forEach((it, i) => {
      if (floating(it.node)) taken += it.sem.frame.w + (i > 0 ? (gaps[i - 1] ?? 0) : (gaps[i] ?? 0));
    });
    const band = round2(base.frame.w - base.padding[1] - pl - taken);
    for (const it of items) {
      if (floating(it.node) || it.sem.width.kind !== "fill" || band <= 0 || band >= it.sem.frame.w) continue;
      const shaped = items.some((f) => floating(f.node) && overlapsX(f.sem.frame, it.sem.frame));
      if (shaped) it.sem.frame = { ...it.sem.frame, w: band };
    }
  }

  // A hugging child that still holds a filling descendant stays greedy in SwiftUI (an
  // unconstrained container passes `maxWidth: .infinity` up), so a row would share its width
  // out instead of packing the measured ones. The browser already shrank it to fit: pin that (app mode
  // fits it to its native content instead, `MarkswiftFitWidth`).
  if (axis === "h")
    for (const it of items)
      if (it.sem.width.kind === "hug" && fillsWidthInside(it.sem))
        it.sem.width = { kind: "fixed", px: round2(it.sem.frame.w), hug: true };

  let leadInset = 0;
  if (items[0]) {
    // Negative = the child hangs outside the content box (a negative margin).
    const f = items[0].sem.frame;
    leadInset = round2(axis === "h" ? f.x - (base.frame.x + pl) : f.y - (base.frame.y + pt));
    if (Math.abs(leadInset) < 0.5) leadInset = 0;
  }
  // A leading gap is only meaningful when children are packed at the start or the distribution
  // leaves outer gaps (around/evenly); for center/end/between it is the distribution's doing.
  if (distribution === "center" || distribution === "end" || distribution === "between") leadInset = 0;
  if (autoGaps.includes(0)) leadInset = round2(Math.max(0, leadInset - (autoMargin(items[0], before) ?? 0)));

  return {
    ...base,
    kind: "stack",
    axis,
    spacing,
    align,
    distribution,
    leadInset,
    ...(autoGaps.length ? { autoGaps } : {}),
    children: items.map((i) => i.sem),
  };
}

/**
 * Measured lines: items overlapping vertically (by more than half the shorter box) and clear of
 * each other horizontally share a line. Boxes that overlap on both axes are not a line but a
 * negative margin — except around a float, whose neighbour's box overlaps it while its ink does
 * not (the browser shortens the line boxes, not the block). Lines run top→bottom, items in a
 * line left→right.
 */
export function linesOf(all: AnalyzedChild[]): AnalyzedChild[][] {
  const lines: AnalyzedChild[][] = [];
  let top = 0;
  let bottom = 0;
  for (const it of all.filter((i) => renders(i.node)).sort((a, b) => a.sem.frame.y - b.sem.frame.y)) {
    const f = it.sem.frame;
    const line = lines[lines.length - 1];
    const overlap = Math.min(bottom, f.y + f.h) - Math.max(top, f.y);
    const clear =
      !line ||
      floating(it.node) ||
      line.every((o) => floating(o.node) || f.x >= o.sem.frame.x + o.sem.frame.w - 1 || f.x + f.w <= o.sem.frame.x + 1);
    if (line && clear && overlap > 1 && overlap >= Math.min(f.h, bottom - top) / 2) {
      line.push(it);
      bottom = Math.max(bottom, f.y + f.h);
    } else {
      lines.push([it]);
      top = f.y;
      bottom = f.y + f.h;
    }
  }
  for (const l of lines) l.sort((a, b) => a.sem.frame.x - b.sem.frame.x);
  return lines;
}
