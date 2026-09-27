import type { GridNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";

const fractionLiteral = (value: number) => Number.isFinite(value)
  ? /[.e]/.test(String(value)) ? String(value) : `${value}.0` : "0.0";

/** App-only dispatch; fidelity continues to reproduce measured child sizes. */
export function weightedLayoutExpr(n: GridNode | StackNode, ctx: EmitContext): string[] {
  const grid = n.kind === "grid";
  const tracks = grid ? n.tracks! : n.allocation!.tracks;
  const rendered = tracks.map(track => `MarkswiftAllocationTrack(basis: ${num(track.basis)}, grow: ${num(track.grow)}, shrink: ${num(track.shrink)}, min: ${num(track.min)}${track.max === undefined ? "" : `, max: ${num(track.max)}`}${track.inset === undefined ? "" : `, inset: ${num(track.inset)}`}${track.basisFraction === undefined ? "" : `, basisFraction: ${fractionLiteral(track.basisFraction)}`})`);
  const contentWidth = n.frame.w - n.padding[1] - n.padding[3];
  const vertical = !grid && n.align === "center" ? ".center" : !grid && n.align === "end" ? ".bottom" : ".top";
  const placements = grid && n.placements ? `, placements: [${n.placements.map(p => `MarkswiftGridPlacement(row: ${p.row}, column: ${p.column}, columnSpan: ${p.columnSpan})`).join(", ")}]` : "";
  const rowSizes = grid && n.rowSizes ? `, rowSizes: [${n.rowSizes.map(size => size === null ? "nil" : num(size)).join(", ")}]` : "";
  const verticalInset = n.padding[0] + n.padding[2];
  const heightPolicy = !grid && n.height.kind === "hug" ? `, intrinsicHeight: true${n.minHeight === undefined ? "" : `, minimumHeight: ${num(Math.max(0, n.minHeight - verticalInset))}`}${n.maxHeight === undefined ? "" : `, maximumHeight: ${num(Math.max(0, n.maxHeight - verticalInset))}`}` : "";
  const out = [`MarkswiftAllocatedLayout(tracks: [${rendered.join(", ")}], columnGap: ${num(grid ? n.hSpacing : n.spacing as number)}, rowGap: ${num(grid ? n.vSpacing : 0)}, grid: ${grid}, vertical: ${vertical}, stretch: ${grid || n.align === "stretch"}${placements}${rowSizes}${heightPolicy}, capturedWidth: ${num(contentWidth)}) {`];
  for (const child of n.children) out.push(...indent(ctx.renderNode(child).split("\n"), 1));
  out.push("}");
  return out;
}
