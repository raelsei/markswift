/** Native-grid admission is proven from resolved tracks and captured cell geometry. */
import type { LayoutNode } from "../model/layout.ts";
import { type GridNode, type SemBase, type SemNode, addDiagnostic } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { parseTrackTemplate, px, round2, resolvedGridTracks } from "../css/index.ts";
import { renders, insetsOf, outOfFlow } from "./geometry.ts";
import { measuredLayoutOf, paintOrder } from "./measured-layout.ts";
import { admitTracks } from "./grid-tracks.ts";

function starts(tracks: number[], gap: number, origin: number): number[] {
  let at = origin;
  return tracks.map((size) => {
    const start = at;
    at += size + gap;
    return start;
  });
}
const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

export function buildGrid(n: LayoutNode, base: SemBase, all: AnalyzedChild[]): GridNode {
  // Grid tracks already account for empty trailing space and item margins.
  base.padding = insetsOf(n.styles);
  const items = all.filter((item) => renders(item.node));
  const widths = resolvedGridTracks(n.styles["grid-template-columns"]);
  const heights = resolvedGridTracks(n.styles["grid-template-rows"]);
  const hSpacing = round2(px(n.styles["column-gap"]));
  const vSpacing = round2(px(n.styles["row-gap"]));
  const columns = widths?.length ?? Math.max(1, new Set(items.map((item) => round2(item.sem.frame.x))).size);
  const xs = starts(widths ?? [], hSpacing, base.frame.x + base.padding[3]);
  const ys = starts(heights ?? [], vSpacing, base.frame.y + base.padding[0]);
  const ordered = [...items].sort((a, b) => a.sem.frame.y - b.sem.frame.y || a.sem.frame.x - b.sem.frame.x);
  // MarkswiftTracks lays out exactly these cells in this order; `admitTracks` proves the DOM's in-flow
  // element children against the capture, so both must be the same nodes in DOM order.
  const inFlow = n.children.filter((c) => c.tag !== "#text" && renders(c) && !outOfFlow(c));
  const admit = (cells: SemNode[]) =>
    cells.length === inFlow.length && cells.every((c, i) => items[i]?.node === inFlow[i] && c === items[i]!.sem)
      ? admitTracks(n)
      : undefined;
  // Native Grid can omit only the final row's trailing cells after all columns are established.
  const regular =
    widths &&
    heights &&
    widths.every((w) => w > 0) &&
    heights.every((h) => h > 0) &&
    ordered.length >= columns &&
    Math.ceil(ordered.length / columns) === heights.length &&
    ordered.every((item, index) => {
      const row = Math.floor(index / columns),
        column = index % columns,
        f = item.sem.frame;
      return near(f.x, xs[column]!) && near(f.y, ys[row]!) && near(f.w, widths[column]!) && near(f.h, heights[row]!);
    });
  if (!regular || n.styles.direction === "rtl") {
    const children = paintOrder(items).map((item) => item.sem);
    for (const child of children) {
      child.width = { kind: "fixed", px: round2(child.frame.w) };
      child.height = { kind: "fixed", px: round2(child.frame.h) };
    }
    const message =
      "captured grid placement preserves holes, spans and alignment; responsive track recalculation is not reconstructed";
    const measured: GridNode = {
      ...base,
      kind: "grid",
      columns,
      hSpacing,
      vSpacing,
      children,
      measured: measuredLayoutOf(base, children),
    };
    // Cells shorter than their row (`align-items: start`) are not "regular", yet an authored
    // template may still place them: app lays them out with MarkswiftTracks, fidelity keeps the
    // measured placement and reports the note at emission (`containerExpr`).
    const admitted = admit(children);
    if (admitted)
      return { ...measured, template: { ...admitted.template, stretch: admitted.stretch, fidelityNote: message } };
    addDiagnostic(base.diagnostics, "approximated", "display: grid", message);
    return measured;
  }
  const contentW = base.frame.w - base.padding[1] - base.padding[3];
  const equalFill =
    widths.every((w) => near(w, widths[0]!)) &&
    near(widths.reduce((sum, w) => sum + w, 0) + (columns - 1) * hSpacing, contentW);
  const children = ordered.map((item) => {
    item.sem.width = equalFill ? { kind: "fill" } : { kind: "fixed", px: round2(item.sem.frame.w) };
    if (item.sem.height.kind === "fill") item.sem.height = { kind: "fixed", px: round2(item.sem.frame.h) };
    return item.sem;
  });
  const authored = parseTrackTemplate(n.preferredSize?.gridTemplateColumns);
  // Authored px tracks the capture reproduces are CSS at every width: nothing to report.
  const pxExact =
    authored !== undefined &&
    !authored.autoRepeat &&
    authored.tracks.length === columns &&
    authored.tracks.every((t, c) => t.kind === "px" && Math.abs(t.px - widths[c]!) <= 1);
  // An equal-fill auto-fill/auto-fit template changes its column count at other widths; the
  // captured px tracks cannot, so the count is pinned and reported.
  const template = n.preferredSize?.gridTemplateColumns ?? "";
  const note = pxExact
    ? undefined
    : equalFill && /repeat\(\s*auto-(fill|fit)/.test(template)
      ? `${template} pinned at ${columns} columns; the column count does not change at other widths`
      : !equalFill
        ? "regular captured tracks mapped to native Grid with fixed column widths; columns do not resize at another width"
        : undefined;
  // App mode lays an admitted template out with MarkswiftTracks; fidelity keeps the captured
  // widths and reports the note at emission (`containerExpr`).
  const grid: GridNode = { ...base, kind: "grid", columns, hSpacing, vSpacing, children };
  const admitted = note ? admit(children) : undefined;
  if (admitted) return { ...grid, template: { ...admitted.template, stretch: admitted.stretch, fidelityNote: note! } };
  if (note) addDiagnostic(base.diagnostics, "approximated", "grid-template-columns", note);
  return grid;
}
