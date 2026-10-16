import type { SemNode, TextNode } from "../model/semantic.ts";
import type { EmitContext, EmitMode } from "./context.ts";
import { note } from "./diagnostics.ts";
import { alignment, num } from "./format.ts";
import { textBoxAlignment, clipsFirstLine, SYSTEM_LINE_HEIGHT } from "./text-box.ts";
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
/** Controls showing one line of their own text, which Chrome centres in the box. */
const LINE_CONTROLS: Record<string, true> = { textField: true, secureField: true, picker: true, datePicker: true };
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
/** The captured fixed height a node's frame keeps (none for a disclosure in app mode, or a grid-stretched/justified cell). */
function fixedHeight(n: SemNode, ctx: EmitContext): number | undefined {
  const app = ctx.mode === "app";
  return n.height.kind === "fixed" &&
    !(app && (ctx.allocated.get(n) === "both" || ctx.allocated.get(n) === "height")) &&
    !(app && n.kind === "control" && n.control === "disclosure")
    ? n.height.px
    : undefined;
}
/** App: a fixed height on a box that lays out text is a `minHeight` floor (`frameModifier`) — except a vertical
 * scroll box's: text past it scrolls instead of growing the box. */
function heightFloor(n: SemNode, ctx: EmitContext): number | undefined {
  const h = fixedHeight(n, ctx);
  const scrollsV = (n.kind === "stack" || n.kind === "grid") && n.scroll === "v";
  return ctx.mode === "app" && h !== undefined && n.maxHeight === undefined && laysOutText(n) && !scrollsV
    ? h
    : undefined;
}
/**
 * App: how far a floored box's captured content overflows its content box, [top, bottom] — an icon taller than
 * its badge, a line box taller than an `h-5` minus padding. CSS paints that overflow without growing the box;
 * the padding gives it back (`boxModifiers`), so the floor grows only by what native text adds.
 */
export function floorOverflow(n: SemNode, ctx: EmitContext): [number, number] {
  const h = surplusFloor(n, ctx) ? undefined : heightFloor(n, ctx);
  if (h === undefined) return [0, 0];
  const top = n.frame.y + n.padding[0];
  const bottom = n.frame.y + h - n.padding[2];
  if (n.kind === "text") {
    // Centred in its box (`textBoxAlignment`): the line box overflows both edges alike.
    const font = n.runs.find((run) => run.gap === undefined)?.font;
    const over = n.lines * (font?.lineHeight ?? (font ? font.size * SYSTEM_LINE_HEIGHT : 0)) - (bottom - top);
    return over > 0.5 ? [over / 2, over / 2] : [0, 0];
  }
  // A MarkswiftMeasuredLayout reports its captured content size, so its overflow never reaches the floor.
  const kids =
    (n.kind === "stack" || n.kind === "grid") && n.scroll === undefined && !n.measured
      ? n.children
      : n.kind === "control"
        ? n.content
        : [];
  if (!kids.length) return [0, 0];
  // A column's first child hanging above the content box already carries it as negative `leadInset` padding.
  const t = n.kind === "stack" && n.axis === "v" ? 0 : top - Math.min(...kids.map((c) => c.frame.y));
  const b = Math.max(...kids.map((c) => c.frame.y + c.frame.h)) - bottom;
  return [t > 0.5 ? t : 0, b > 0.5 ? b : 0];
}
export function frameModifier(n: SemNode, ctx: EmitContext): string[] {
  const parts: string[] = [];
  // Mode difference — sizing. Fidelity keeps every measured fixed size. App: a width equal to
  // the screen width is "fill" (the device decides), and a fixed height on a box that lays out
  // text is a floor (`minHeight`) so native text metrics (Dynamic Type) can grow it without
  // clipping — measured or authored alike: CSS would overflow or clip the text, an app must not.
  const app = ctx.mode === "app";
  // App: a runtime Layout (MarkswiftTracks, MarkswiftFlexRow) allocates this cell's width, and with grid stretch its
  // height; a justified grid cell only its height.
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
  const fit = app && n.width.kind === "fixed" && n.width.hug === true && (!allocated || allocated === "height");
  const w =
    allocated || fit ? undefined : n.width.kind === "fixed" ? n.width.px : fraction && !app ? fraction.px : undefined;
  // App: a disclosure grows when it opens, so its captured (closed or open) height is not kept.
  const h = fixedHeight(n, ctx);
  const screenWide = app && w !== undefined && Math.abs(w - ctx.screen.size.w) <= 0.5;
  const surplus = surplusFloor(n, ctx);
  const floor = surplus ? Math.max(h ?? 0, n.frame.h) : heightFloor(n, ctx);
  const fixedW = w !== undefined && !screenWide ? `width: ${num(w)}` : undefined;
  const fixedH = h !== undefined && floor === undefined ? `height: ${num(h)}` : undefined;
  const fillW =
    n.width.kind === "fill" ||
    screenWide ||
    allocated === "width" ||
    allocated === "both" ||
    (fraction !== undefined && app);
  const fillH = n.height.kind === "fill" || allocated === "both" || allocated === "height";
  const align =
    surplus && n.kind === "text"
      ? alignment(n.align === "trailing" ? "end" : n.align, surplus.edge === "top" ? "end" : "start")
      : fillAlignment(n, ctx.mode);
  // A fixed frame centres its content by default; the browser packs a container's content per
  // its own alignment (block flow / flex start), text per its text-align, and a control's content
  // where it measured it (a switch thumb at the track's start).
  const aligned =
    n.kind === "text" || n.kind === "stack" || n.kind === "grid" || (n.kind === "control" && n.content.length);
  if (fixedW || fixedH)
    parts.push(`.frame(${[fixedW, fixedH].filter(Boolean).join(", ")}${aligned ? `, alignment: ${align}` : ""})`);
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
  // App: CSS shrink-to-fit never exceeds the container, so the width fits (`markswiftFitWidth`)
  // instead of taking the content's ideal — one unwrapped line — past the offered width.
  const hugW = !fixedW && n.width.kind === "hug" && n.maxWidth !== undefined;
  // A vertical ScrollView sized to its ideal height is as tall as its content and would not scroll: an app scroll
  // box capped by `max-height` takes the height offered up to the cap instead.
  const hugH =
    !fixedH &&
    n.height.kind === "hug" &&
    n.maxHeight !== undefined &&
    !(app && (n.kind === "stack" || n.kind === "grid") && n.scroll === "v");
  if ((hugW && !app) || hugH) parts.push(`.fixedSize(horizontal: ${hugW && !app}, vertical: ${hugH})`);
  if (fit || (hugW && app)) parts.push(".markswiftFitWidth()");
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
export function fillAlignment(n: SemNode, mode: EmitMode): string {
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
  // A control's content where the browser put it in its content box (layout position, before any
  // transform): a button centres its label — a single label carries the whole content box, so it
  // reads as centred too — and a switch keeps its thumb at the start.
  if (n.kind === "control" && n.content.length) {
    const fs = n.content.map((c) => c.frame);
    const [h, v] = [
      [
        Math.min(...fs.map((f) => f.x)) - n.frame.x - n.padding[3],
        n.frame.x + n.frame.w - n.padding[1] - Math.max(...fs.map((f) => f.x + f.w)),
      ],
      [
        Math.min(...fs.map((f) => f.y)) - n.frame.y - n.padding[0],
        n.frame.y + n.frame.h - n.padding[2] - Math.max(...fs.map((f) => f.y + f.h)),
      ],
    ].map(([before, after]) => (Math.abs(before! - after!) <= 1 ? "center" : before! < after! ? "start" : "end"));
    return alignment(h!, v!);
  }
  // A single-line field, select or date input: Chrome centres its text in the box (an editor's starts at the top).
  if (n.kind === "control" && LINE_CONTROLS[n.control]) return ".leading";
  return ".topLeading";
}
