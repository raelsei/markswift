import type { SemNode, TextNode } from "../model/semantic.ts";
import type { EmitContext, EmitMode } from "./context.ts";
import { note } from "./diagnostics.ts";
import { alignment, num } from "./format.ts";
import { textBoxAlignment, clipsFirstLine } from "./text-box.ts";
/** Controls whose height follows their label: in app mode a measured CSS height is a floor, so Dynamic Type can grow it. */
const TEXT_CONTROLS: Record<string, true> = {
  button: true,
  link: true,
  textField: true,
  secureField: true,
  picker: true,
  textEditor: true,
  datePicker: true,
};
/**
 * App: the line-box surplus the analysis moved into one edge's padding (text off its box's centre,
 * `lineBoxGrowth.padded`). Emitted as a `minHeight` floor of the measured box aligned away from
 * that edge instead, so growing text absorbs it like CSS does rather than adding it on top.
 */
export function surplusFloor(n: SemNode, ctx: Pick<EmitContext, "mode">): TextNode["lineBoxGrowth"] {
  return ctx.mode === "app" && n.kind === "text" && n.lineBoxGrowth?.padded && n.maxHeight === undefined
    ? n.lineBoxGrowth
    : undefined;
}
export function frameModifier(n: SemNode, ctx: EmitContext): string[] {
  const parts: string[] = [];
  // Mode difference — sizing. Fidelity keeps every measured fixed size. App: a width equal to
  // the screen width is "fill" (the device decides), and a fixed height on a box that lays out
  // text is a floor (`minHeight`) so native text metrics (Dynamic Type) can grow it without
  // clipping — measured or authored alike: CSS would overflow or clip the text, an app must not.
  const app = ctx.mode === "app";
  // App: a runtime Layout (MarkswiftTracks, MarkswiftFlexRow) allocates this cell's width, and with grid stretch its height.
  const allocated = app ? ctx.allocated.get(n) : undefined;
  // A percentage width: app fills the MarkswiftFraction wrapper (`boxModifiers`); fidelity keeps the captured px.
  const fraction = n.width.kind === "fraction" ? n.width : undefined;
  if (fraction && !app)
    note(
      n,
      "approximated",
      "width",
      `width ${+(fraction.fraction * 100).toFixed(4)}% pinned at ${fraction.px}px; it does not follow the container at other widths`,
    );
  // App: a box that hugs in CSS, pinned only against its filling children's greed, fits its native content instead.
  const fit = app && n.width.kind === "fixed" && n.width.hug === true && !allocated;
  const w =
    allocated || fit ? undefined : n.width.kind === "fixed" ? n.width.px : fraction && !app ? fraction.px : undefined;
  // App: a disclosure grows when it opens, so its captured (closed or open) height is not kept.
  const h =
    n.height.kind === "fixed" && allocated !== "both" && !(app && n.kind === "control" && n.control === "disclosure")
      ? n.height.px
      : undefined;
  const screenWide = app && w !== undefined && Math.abs(w - ctx.screen.size.w) <= 0.5;
  const surplus = surplusFloor(n, ctx);
  const floor = surplus
    ? Math.max(h ?? 0, n.frame.h)
    : app && h !== undefined && n.maxHeight === undefined && laysOutText(n)
      ? h
      : undefined;
  const fixedW = w !== undefined && !screenWide ? `width: ${num(w)}` : undefined;
  const fixedH = h !== undefined && floor === undefined ? `height: ${num(h)}` : undefined;
  const fillW = n.width.kind === "fill" || screenWide || allocated !== undefined || (fraction !== undefined && app);
  const fillH = n.height.kind === "fill" || allocated === "both";
  const align =
    surplus && n.kind === "text"
      ? alignment(n.align === "trailing" ? "end" : n.align, surplus.edge === "top" ? "end" : "start")
      : fillAlignment(n, ctx.mode);
  // A fixed frame centres its content by default; the browser packs a container's content per
  // its own alignment (block flow / flex start), and text per its text-align.
  if (fixedW || fixedH)
    parts.push(
      `.frame(${[fixedW, fixedH].filter(Boolean).join(", ")}${n.kind === "text" || n.kind === "stack" || n.kind === "grid" ? `, alignment: ${align}` : ""})`,
    );
  // Limits apply to the painted box. A later infinity frame would expand that paint beyond
  // a finite cap. Margin placement, when needed, is applied after paint by modifiers.ts.
  // Fixed dimensions already include the browser's limits; wrapping them in a flexible cap
  // would grow a smaller explicit size to the cap instead of keeping its measured dimension.
  const minHeight = n.minHeight === undefined ? floor : Math.max(n.minHeight, floor ?? 0);
  // A flexible frame without a minimum grows to content wider than the proposal. A CSS fill box
  // keeps its container's width and lets that content overflow (or clips it, for `overflow:
  // hidden`), unless it is an item whose automatic minimum is its content (`contentMinWidth`).
  const minWidth = n.minWidth ?? (fillW && (n.style.clip || !ctx.contentMinWidth.has(n)) ? 0 : undefined);
  const flex = [
    !fixedW && minWidth !== undefined ? `minWidth: ${num(minWidth)}` : "",
    !fixedW && n.maxWidth !== undefined
      ? `maxWidth: ${num(n.maxWidth)}`
      : !fixedW && fillW
        ? "maxWidth: .infinity"
        : "",
    !fixedH && minHeight !== undefined ? `minHeight: ${num(minHeight)}` : "",
    !fixedH && n.maxHeight !== undefined
      ? `maxHeight: ${num(n.maxHeight)}`
      : !fixedH && fillH
        ? "maxHeight: .infinity"
        : "",
  ].filter(Boolean);
  if (flex.length) parts.push(`.frame(${flex.join(", ")}, alignment: ${align})`);
  // A finite SwiftUI frame accepts its parent's proposal even for intrinsic content. Ask
  // for the capped frame's ideal size on hugging axes before any background is painted.
  const hugW = !fixedW && n.width.kind === "hug" && n.maxWidth !== undefined;
  const hugH = !fixedH && n.height.kind === "hug" && n.maxHeight !== undefined;
  if (hugW || hugH) parts.push(`.fixedSize(horizontal: ${hugW}, vertical: ${hugH})`);
  if (fit) parts.push(".markswiftFitWidth()");
  return parts;
}

/** Text the node lays out in flow (overlays excluded): its height follows the text's native metrics. */
function laysOutText(n: SemNode): boolean {
  if (n.kind === "text") return true;
  if (n.kind === "stack" || n.kind === "grid") return n.children.some(laysOutText);
  if (n.kind === "control") return TEXT_CONTROLS[n.control] === true || n.content.some(laysOutText);
  return false;
}

/** Where a node sits inside its fill frame: follows its own alignment semantics. */
function fillAlignment(n: SemNode, mode: EmitMode): string {
  // A capped, clipping text box shows its first lines (CSS), however native metrics grow the text.
  if (n.kind === "text")
    return textBoxAlignment(n, clipsFirstLine(n) || (n.maxHeight !== undefined && n.style.clip === true));
  if (n.kind === "stack") {
    if (n.wrap) return ".topLeading";
    // Horizontal: cross alignment for columns, distribution for rows. Vertical: distribution
    // for columns; rows follow their cross alignment in app mode — in fidelity always .top,
    // because their children carry measured top offsets (see `containerExpr`).
    const h = n.axis === "v" ? n.align : n.distribution;
    const v = n.axis === "v" ? n.distribution : mode === "app" ? n.align : "start";
    return alignment(h, v);
  }
  return ".topLeading";
}
