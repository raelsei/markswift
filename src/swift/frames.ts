import type { SemNode } from "../model/semantic.ts";
import type { EmitContext, EmitMode } from "./context.ts";
import { num } from "./format.ts";
import { textBoxAlignment, clipsFirstLine } from "./text-box.ts";
export function frameModifier(n: SemNode, ctx: EmitContext): string[] {
  const parts: string[] = [];
  // Mode difference — sizing. Fidelity keeps every measured fixed size. App: a width equal to
  // the screen width is "fill" (the device decides), and a fixed height on an ordinary
  // text-only stack is a floor (`minHeight`) so native text metrics can grow it without clipping.
  // Measured and wrapping layouts own their geometry, so their fixed heights remain exact.
  const app = ctx.mode === "app";
  const w = n.width.kind === "fixed" ? n.width.px : n.width.kind === "fraction" && !app ? n.width.capturedPx : undefined;
  const h = n.height.kind === "fixed" ? n.height.px : undefined;
  const screenWide = app && w !== undefined && Math.abs(w - ctx.screen.size.w) <= 0.5;
  const textFloor = app && h !== undefined && n.maxHeight === undefined && n.kind === "stack"
    && !n.measured && !n.wrap && n.children.length > 0 && n.children.every((c) => c.kind === "text") ? h : undefined;
  const fixedW = w !== undefined && !screenWide ? `width: ${num(w)}` : undefined;
  const fixedH = h !== undefined && textFloor === undefined ? `height: ${num(h)}` : undefined;
  const fillW = n.width.kind === "fill" || screenWide;
  const fillH = n.height.kind === "fill";
  const align = fillAlignment(n, ctx.mode);
  // A fixed frame centres its content by default; the browser packs a container's content per
  // its own alignment (block flow / flex start), and text per its text-align.
  if (fixedW || fixedH) parts.push(`.frame(${[fixedW, fixedH].filter(Boolean).join(", ")}${n.kind === "text" || n.kind === "stack" || n.kind === "grid" ? `, alignment: ${align}` : ""})`);
  if (app && n.width.kind === "fraction") parts.push(`.modifier(MarkswiftRelativeWidth(fraction: ${num(n.width.value)}, capturedWidth: ${num(n.width.capturedPx)}))`);
  // Limits apply to the painted box. A later infinity frame would expand that paint beyond
  // a finite cap. Margin placement, when needed, is applied after paint by modifiers.ts.
  // Fixed dimensions already include the browser's limits; wrapping them in a flexible cap
  // would grow a smaller explicit size to the cap instead of keeping its measured dimension.
  const minHeight = n.minHeight === undefined ? textFloor : Math.max(n.minHeight, textFloor ?? 0);
  const flex = [
    !fixedW && n.minWidth !== undefined ? `minWidth: ${num(n.minWidth)}` : "",
    !fixedW && n.maxWidth !== undefined ? `maxWidth: ${num(n.maxWidth)}` : !fixedW && fillW ? "maxWidth: .infinity" : "",
    !fixedH && minHeight !== undefined ? `minHeight: ${num(minHeight)}` : "",
    !fixedH && n.maxHeight !== undefined ? `maxHeight: ${num(n.maxHeight)}` : !fixedH && fillH ? "maxHeight: .infinity" : "",
  ].filter(Boolean);
  if (flex.length) parts.push(`.frame(${flex.join(", ")}, alignment: ${align})`);
  // A finite SwiftUI frame accepts its parent's proposal even for intrinsic content. Ask
  // for the capped frame's ideal size on hugging axes before any background is painted.
  const hugW = !fixedW && n.width.kind === "hug" && n.maxWidth !== undefined;
  const hugH = !fixedH && n.height.kind === "hug" && n.maxHeight !== undefined;
  if (hugW || hugH) parts.push(`.fixedSize(horizontal: ${hugW}, vertical: ${hugH})`);
  return parts;
}

/** Where a node sits inside its fill frame: follows its own alignment semantics. */
function fillAlignment(n: SemNode, mode: EmitMode): string {
  if (n.kind === "text") return textBoxAlignment(n, clipsFirstLine(n));
  if (n.kind === "stack") {
    if (n.wrap) return ".topLeading";
    // Horizontal: cross alignment for columns, distribution for rows. Vertical: distribution
    // for columns; rows follow their cross alignment in app mode — in fidelity always .top,
    // because their children carry measured top offsets (see `containerExpr`).
    const h = n.axis === "v" ? n.align : n.distribution;
    const v = n.axis === "v" ? n.distribution : mode === "app" ? n.align : "start";
    const hs = h === "center" ? "" : h === "end" ? "Trailing" : "Leading";
    const vs = v === "center" ? "center" : v === "end" ? "bottom" : "top";
    if (vs === "center") return hs === "" ? ".center" : hs === "Leading" ? ".leading" : ".trailing";
    return `.${vs}${hs}`;
  }
  return ".topLeading";
}
