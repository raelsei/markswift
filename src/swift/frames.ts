import type { SemNode } from "../model/semantic.ts";
import type { EmitContext, EmitMode } from "./context.ts";
import { num } from "./format.ts";
export function frameModifier(n: SemNode, ctx: EmitContext): string[] {
  const parts: string[] = [];
  // Mode difference — sizing. Fidelity keeps every measured fixed size. App: a width equal to
  // the screen width is "fill" (the device decides), and a fixed height on a text-only container
  // is a floor (`minHeight`) so native text metrics can grow it without clipping.
  const app = ctx.mode === "app";
  const w = n.width.kind === "fixed" ? n.width.px : undefined;
  const h = n.height.kind === "fixed" ? n.height.px : undefined;
  const screenWide = app && w !== undefined && Math.abs(w - ctx.screen.size.w) <= 0.5;
  const minH = app && h !== undefined && n.kind === "stack" && n.children.length > 0 && n.children.every((c) => c.kind === "text") ? `minHeight: ${num(h)}` : "";
  const fixedW = w !== undefined && !screenWide ? `width: ${num(w)}` : undefined;
  const fixedH = h !== undefined && !minH ? `height: ${num(h)}` : undefined;
  const fillW = n.width.kind === "fill" || screenWide;
  const fillH = n.height.kind === "fill";
  const align = fillAlignment(n, ctx.mode);
  // A box the browser sized with its own horizontal margins (`margin: 0 auto`, plain side
  // margins): `maxWidth` is what they left, so it must not expand. The placement frame that
  // centres or trails it is appended after the paint — see `modifiers`.
  const capped = n.selfAlign !== undefined && n.maxWidth !== undefined;
  if (n.maxWidth !== undefined && !fixedW) parts.push(`.frame(maxWidth: ${num(n.maxWidth)}, alignment: ${align})`);
  // A fixed frame centres its content by default; the browser packs a container's content per
  // its own alignment (block flow / flex start), and text per its text-align.
  if (fixedW || fixedH) parts.push(`.frame(${[fixedW, fixedH].filter(Boolean).join(", ")}${n.kind === "text" || n.kind === "stack" || n.kind === "grid" ? `, alignment: ${align}` : ""})`);
  const flex = [!capped && fillW ? "maxWidth: .infinity" : "", minH, fillH ? "maxHeight: .infinity" : ""].filter(Boolean);
  if (flex.length) parts.push(`.frame(${flex.join(", ")}, alignment: ${align})`);
  return parts;
}

/** Where a node sits inside its fill frame: follows its own alignment semantics. */
function fillAlignment(n: SemNode, mode: EmitMode): string {
  if (n.kind === "text") return n.align === "center" ? ".center" : n.align === "trailing" ? ".trailing" : ".leading";
  if (n.kind === "stack") {
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
