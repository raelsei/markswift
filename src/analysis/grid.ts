/** Native-grid admission is proven from resolved tracks and captured cell geometry. */
import type { LayoutNode } from "../model/layout.ts";
import type { GridNode, SemBase } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { px, round2 } from "../css/index.ts";
import { resolvedGridTracks } from "../css/grid.ts";
import { fractionGridTracks } from "../css/grid.ts";
import type { AllocationTrack } from "../model/allocation.ts";
import { gridAllocatedWidths } from "./allocation.ts";
import { automaticHeight, fixedLength, zeroAutomaticMinimum, restoreAllocatedInsets, hasAutoMargins } from "./flex-allocation.ts";
import { renders, insetsOf } from "./geometry.ts";
import { measuredLayoutOf } from "./measured-layout.ts";

function starts(tracks: number[], gap: number, origin: number): number[] {
  let at = origin;
  return tracks.map(size => { const start = at; at += size + gap; return start; });
}
const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

export function buildGrid(n: LayoutNode, base: SemBase, all: AnalyzedChild[]): GridNode {
  // Grid tracks already account for empty trailing space and item margins.
  base.padding = insetsOf(n.styles);
  const items = all.filter(item => renders(item.node));
  const widths = resolvedGridTracks(n.styles["grid-template-columns"]);
  const heights = resolvedGridTracks(n.styles["grid-template-rows"]);
  const hSpacing = round2(px(n.styles["column-gap"]));
  const vSpacing = round2(px(n.styles["row-gap"]));
  const columns = widths?.length ?? Math.max(1, new Set(items.map(item => round2(item.sem.frame.x))).size);
  const xs = starts(widths ?? [], hSpacing, base.frame.x + base.padding[3]);
  const ys = starts(heights ?? [], vSpacing, base.frame.y + base.padding[0]);
  const ordered = [...items].sort((a, b) => a.sem.frame.y - b.sem.frame.y || a.sem.frame.x - b.sem.frame.x);
  // Native Grid can omit only the final row's trailing cells after all columns are established.
  const regular = widths && heights && widths.every(w => w > 0) && heights.every(h => h > 0)
    && ordered.length >= columns && Math.ceil(ordered.length / columns) === heights.length
    && ordered.every((item, index) => {
      const row = Math.floor(index / columns), column = index % columns, f = item.sem.frame;
      return near(f.x, xs[column]!) && near(f.y, ys[row]!) && near(f.w, widths[column]!) && near(f.h, heights[row]!);
    });
  if (!regular || n.styles.direction === "rtl") {
    const children = [...items].sort((a, b) => (a.node.paint ?? 0) - (b.node.paint ?? 0)).map(item => item.sem);
    for (const child of children) {
      child.width = { kind: "fixed", px: round2(child.frame.w) };
      child.height = { kind: "fixed", px: round2(child.frame.h) };
    }
    base.notes.push("approximated: captured grid placement preserves holes, spans and alignment; responsive track recalculation is not reconstructed");
    return { ...base, kind: "grid", columns, hSpacing, vSpacing, children, measured: measuredLayoutOf(base, children) };
  }
  const intent = fractionGridTracks(n.preferredSize?.gridTemplateColumns);
  const autoRows = n.preferredSize?.gridTemplateRows;
  const automaticRows = autoRows === "auto" || /^repeat\(\s*\d+\s*,\s*auto\s*\)$/.test(autoRows ?? "")
    || /^auto(?:\s+auto)*$/.test(autoRows ?? "")
    || (autoRows === "none" && n.preferredSize?.gridAutoRows === "auto");
  const rowCount = heights!.length;
  const declaredRowCount = autoRows?.match(/^repeat\(\s*(\d+)\s*,\s*auto\s*\)$/)?.[1]
    ?? (autoRows === "none" ? "0" : String(autoRows?.split(/\s+/).length ?? 0));
  const rowsProven = automaticRows && (rowCount <= Number(declaredRowCount) || n.preferredSize?.gridAutoRows === "auto");
  const explicitRows = autoRows === "none" ? [] : fractionGridTracks(autoRows);
  const implicitRows = fractionGridTracks(n.preferredSize?.gridAutoRows);
  const fixedRows = explicitRows?.every(track => "fixed" in track) && (implicitRows === undefined || implicitRows.every(track => "fixed" in track))
    ? heights!.map((_, row) => {
      const explicit = explicitRows[row];
      const implicit = implicitRows?.[(row - explicitRows.length) % implicitRows.length];
      const track = explicit ?? implicit;
      return track && "fixed" in track ? track.fixed : undefined;
    }) : undefined;
  const fixedRowsProven = fixedRows?.every((height, row) => height !== undefined && near(height, heights![row]!));
  const contentW = base.frame.w - base.padding[1] - base.padding[3];
  const tracks: AllocationTrack[] | undefined = intent?.length === columns ? intent.map(track => "fixed" in track
    ? { basis: track.fixed, grow: 0, shrink: 0, min: track.fixed, max: track.fixed }
    : { basis: 0, grow: track.fraction, shrink: 0, min: track.minimum ?? 0 }) : undefined;
  const minProven = intent?.every((track, column) => "fixed" in track || track.minimum !== undefined
    || ordered.filter((_, i) => i % columns === column).every(item => zeroAutomaticMinimum(item.node)));
  const simpleCells = ordered.every(item => {
    const child = item.node;
    const width = child.preferredSize?.width;
    return n.children.includes(child) && !hasAutoMargins(child) && ["top", "right", "bottom", "left"].every(edge => px(child.styles[`margin-${edge}`]) === 0)
      && (width === undefined || width === "auto")
      && (fixedLength(child.styles["min-width"]) === 0 || (child.styles["min-width"] ?? "auto") === "auto")
      && (child.styles["max-width"] ?? "none") === "none"
      && /^(auto|normal|stretch)?$/.test(child.styles["justify-self"] ?? "")
      && /^(auto|normal|stretch)?$/.test(child.styles["align-self"] ?? "")
      && /^(auto)?$/.test(child.styles["aspect-ratio"] ?? "")
      && (automaticHeight(child) || fixedLength(child.preferredSize?.height) !== undefined);
  });
  const allocated = tracks && gridAllocatedWidths(contentW - (columns - 1) * hSpacing, tracks);
  const agrees = allocated && widths!.every((width, i) => near(width, allocated[i]!));
  const itemAlignment = /^(normal|stretch)?$/.test(n.styles["align-items"] ?? "")
    && /^(normal|stretch)?$/.test(n.styles["justify-items"] ?? "");
  const spacingProven = [n.styles["column-gap"], n.styles["row-gap"]].every(value => value === undefined
    || value === "normal" || fixedLength(value) !== undefined);
  if (tracks && tracks.some(track => track.grow > 0) && minProven && simpleCells && (rowsProven || fixedRowsProven) && agrees
    && itemAlignment && spacingProven
    && /^(row)?$/.test(n.styles["grid-auto-flow"] ?? "") && automaticHeight(n)
    && (n.styles["min-height"] === undefined || n.styles["min-height"] === "auto" || fixedLength(n.styles["min-height"]) === 0)
    && (n.styles["max-height"] ?? "none") === "none"
    && /^(normal|stretch|start)?$/.test(n.styles["align-content"] ?? "")) {
    const children = ordered.map((item, i) => {
      item.sem.width = { kind: "fill" };
      if (fixedRowsProven) item.sem.height = { kind: "fixed", px: fixedRows![Math.floor(i / columns)]! };
      else if (automaticHeight(item.node)) item.sem.height = { kind: "fill" };
      restoreAllocatedInsets(item.node, item.sem);
      return item.sem;
    });
    return { ...base, kind: "grid", columns, hSpacing, vSpacing, tracks, height: { kind: "hug" }, children, measured: measuredLayoutOf(base, children) };
  }
  if (n.preferredSize?.gridTemplateColumns !== undefined) {
    const children = ordered.map(item => {
      item.sem.width = { kind: "fixed", px: round2(item.sem.frame.w) };
      item.sem.height = { kind: "fixed", px: round2(item.sem.frame.h) };
      return item.sem;
    });
    base.notes.push(!spacingProven
      ? "approximated: captured grid placement; relative or intrinsic grid gap is not reconstructed at another width"
      : itemAlignment
        ? "approximated: captured grid placement; track intent, automatic minimums, row sizing or flow do not establish native responsive allocation"
        : "approximated: captured grid placement; item alignment requires intrinsic cell sizes and is not reconstructed at another width");
    return { ...base, kind: "grid", columns, hSpacing, vSpacing, children, measured: measuredLayoutOf(base, children) };
  }
  const equalFill = widths.every(w => near(w, widths[0]!)) && near(widths.reduce((sum, w) => sum + w, 0) + (columns - 1) * hSpacing, contentW);
  const children = ordered.map(item => {
    item.sem.width = equalFill ? { kind: "fill" } : { kind: "fixed", px: round2(item.sem.frame.w) };
    if (item.sem.height.kind === "fill") item.sem.height = { kind: "fixed", px: round2(item.sem.frame.h) };
    return item.sem;
  });
  base.notes.push("approximated: regular captured tracks mapped to native Grid; responsive track definitions are not reconstructed");
  return { ...base, kind: "grid", columns, hSpacing, vSpacing, children };
}
