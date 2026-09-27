import type { LayoutNode } from "../model/layout.ts";
import type { GridNode, SemBase } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import type { AllocationTrack } from "../model/allocation.ts";
import { fractionGridTracks, gridRowTracks, resolvedGridTracks } from "../css/grid.ts";
import { px } from "../css/syntax.ts";
import { gridAllocatedWidths } from "./allocation.ts";
import { gridPlacements } from "./grid-placement.ts";
import { automaticHeight, fixedLength, zeroAutomaticMinimum, restoreAllocatedInsets, hasAutoMargins, hasRelativePadding } from "./flex-allocation.ts";
import { measuredLayoutOf } from "./measured-layout.ts";
import { flowFrame, relativeFallback } from "./relative-position.ts";

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
const starts = (sizes: number[], gap: number, origin: number): number[] => {
  let at = origin;
  return sizes.map(size => { const start = at; at += size + gap; return start; });
};

/** Reconstruct only CSS rules whose used tracks and placements agree with the capture. */
export function allocatedGrid(n: LayoutNode, base: SemBase, items: AnalyzedChild[], hSpacing: number, vSpacing: number):
  { grid?: GridNode; reason?: string } {
  if (hasRelativePadding(n)) return { reason: "relative padding is not reconstructed at another width" };
  if (![n.styles["column-gap"], n.styles["row-gap"]].every(value => value === undefined || value === "normal" || fixedLength(value) !== undefined)) {
    return { reason: "relative or intrinsic grid gap is not reconstructed at another width" };
  }
  if (n.styles.direction === "rtl" || !/^(horizontal-tb)?$/.test(n.styles["writing-mode"] ?? "")) return { reason: "grid writing direction" };
  if (!/^(normal|stretch)?$/.test(n.styles["align-items"] ?? "") || !/^(normal|stretch)?$/.test(n.styles["justify-items"] ?? "")) {
    return { reason: "item alignment requires intrinsic cell sizes and is not reconstructed at another width" };
  }
  if (!automaticHeight(n) || !/^(auto|0(?:px)?)$/.test(n.styles["min-height"] ?? "auto") || (n.styles["max-height"] ?? "none") !== "none"
    || !/^(normal|stretch|start)?$/.test(n.styles["align-content"] ?? "") || !/^(normal|stretch|start)?$/.test(n.styles["justify-content"] ?? "")) {
    return { reason: "constrained grid height or track alignment" };
  }
  const intent = fractionGridTracks(n.preferredSize?.gridTemplateColumns);
  const widths = resolvedGridTracks(n.styles["grid-template-columns"]);
  const heights = resolvedGridTracks(n.styles["grid-template-rows"]);
  if (intent && widths && intent.length !== widths.length) return { reason: "implicit grid columns are not reconstructed" };
  if (!intent || !widths || !heights) return { reason: "intrinsic or unproved grid tracks" };
  const explicitRows = gridRowTracks(n.preferredSize?.gridTemplateRows);
  const implicitRows = gridRowTracks(n.preferredSize?.gridAutoRows ?? "auto");
  if (!explicitRows || !implicitRows?.length) return { reason: "intrinsic or unproved grid row sizing" };
  const placed = gridPlacements(items.map(item => item.node), intent.length, n.styles["grid-auto-flow"] ?? "row", explicitRows.length);
  if (!placed.placements) return { reason: placed.reason };
  const placements = placed.placements;
  if (placed.rows !== heights.length) return { reason: "grid row extent disagrees with authored placement" };
  const reconstructed = intent.every(track => "fixed" in track)
    || placements.some((placement, i) => placement.columnSpan !== 1 || placement.column !== i % intent.length || placement.row !== Math.floor(i / intent.length));
  if (reconstructed && (n.preferredSize?.inlineSizeDefinite !== true || (n.styles.display === "inline-grid" && n.preferredSize?.width === "auto"))) {
    return { reason: "indefinite grid container for numeric placement" };
  }
  const rowSizes = heights.map((_, row) => row < explicitRows.length ? explicitRows[row]! : implicitRows[(row - explicitRows.length) % implicitRows.length]!);
  if (rowSizes.some((size, row) => size !== null ? !near(size, heights[row]!) : !placements.some(item => item.row === row) && !near(0, heights[row]!))) {
    return { reason: "grid row sizing disagrees with authored rules" };
  }
  const tracks: AllocationTrack[] = intent.map(track => "fixed" in track
    ? { basis: track.fixed, grow: 0, shrink: 0, min: track.fixed, max: track.fixed }
    : { basis: 0, grow: track.fraction, shrink: 0, min: track.minimum ?? 0 });
  const minima = intent.every((track, column) => "fixed" in track || track.minimum !== undefined
    || items.every((item, i) => {
      const placement = placements[i]!;
      return column < placement.column || column >= placement.column + placement.columnSpan || zeroAutomaticMinimum(item.node);
    }));
  if (!minima) return { reason: "automatic grid column minimums are unproved" };
  const cells = items.every(({ node: child, sem }) => n.children.includes(child) && !hasAutoMargins(child)
    && ["top", "right", "bottom", "left"].every(edge => px(child.styles[`margin-${edge}`]) === 0)
    && /^(auto)?$/.test(child.preferredSize?.width ?? "")
    && /^(auto|0(?:px)?)$/.test(child.styles["min-width"] ?? "auto") && (child.styles["max-width"] ?? "none") === "none"
    && /^(auto|0(?:px)?)$/.test(child.styles["min-height"] ?? "auto") && (child.styles["max-height"] ?? "none") === "none"
    && /^(auto|normal|stretch)?$/.test(child.styles["justify-self"] ?? "") && /^(auto|normal|stretch)?$/.test(child.styles["align-self"] ?? "")
    && /^(auto)?$/.test(child.styles["aspect-ratio"] ?? "")
    && /^(static|relative)?$/.test(child.styles.position ?? "")
    && !relativeFallback(sem)
    && (automaticHeight(child) || fixedLength(child.preferredSize?.height) !== undefined));
  if (!cells) return { reason: "grid cell sizing, margins or alignment are unproved" };
  const contentW = base.frame.w - base.padding[1] - base.padding[3];
  const allocated = gridAllocatedWidths(contentW - (intent.length - 1) * hSpacing, tracks);
  if (!widths.every((width, i) => near(width, allocated[i]!))) return { reason: "grid column allocation disagrees with authored rules" };
  const xs = starts(widths, hSpacing, base.frame.x + base.padding[3]);
  const ys = starts(heights, vSpacing, base.frame.y + base.padding[0]);
  const geometry = items.every(({ sem }, i) => {
    const p = placements[i]!, f = flowFrame(sem);
    const width = widths.slice(p.column, p.column + p.columnSpan).reduce((sum, size) => sum + size, 0) + (p.columnSpan - 1) * hSpacing;
    return near(f.x, xs[p.column]!) && near(f.y, ys[p.row]!) && near(f.w, width) && near(f.h, heights[p.row]!);
  });
  const naturalHeight = heights.reduce((sum, height) => sum + height, 0) + (heights.length - 1) * vSpacing;
  if (!geometry || !near(naturalHeight, base.frame.h - base.padding[0] - base.padding[2])) return { reason: "grid cell geometry disagrees with authored placement" };
  const children = items.map((item, i) => {
    item.sem.width = { kind: "fill" };
    const height = rowSizes[placements[i]!.row]!;
    if (height !== null) item.sem.height = { kind: "fixed", px: height };
    else if (automaticHeight(item.node)) item.sem.height = { kind: "fill" };
    restoreAllocatedInsets(item.node, item.sem);
    return item.sem;
  });
  return { grid: { ...base, kind: "grid", columns: intent.length, hSpacing, vSpacing, tracks, placements, rowSizes,
    height: { kind: "hug" }, children, measured: measuredLayoutOf(base, children) } };
}
