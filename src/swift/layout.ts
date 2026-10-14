import type { StackNode, GridNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { note } from "./diagnostics.ts";
import { horizontalAlignment, indent, num, verticalAlignment } from "./format.ts";
import { fillAlignment } from "./frames.ts";
import { decorate, overlayModifier, paddingModifiers } from "./modifiers.ts";
import { measuredLayoutExpr } from "./measured-layout.ts";
import { wrappingExpr } from "./wrapping.ts";

/** App mode: an admitted authored template (`GridNode.template`) laid out by the runtime `MarkswiftTracks`. */
function tracksExpr(n: GridNode, t: NonNullable<GridNode["template"]>, ctx: EmitContext): string[] {
  const layout = t.autoRepeat
    ? `autoRepeat: .${t.autoRepeat.mode}(min: ${num(t.autoRepeat.min)})`
    : `tracks: [${t.tracks.map((k) => (k.kind === "auto" ? ".auto" : k.kind === "px" ? `.px(${num(k.px)})` : `.fr(${num(k.fr)}${k.min === undefined ? "" : `, min: ${num(k.min)}`})`)).join(", ")}]`;
  const stretch = t.stretch ? "" : ", stretch: false";
  return [
    `MarkswiftTracks(${layout}, hSpacing: ${num(n.hSpacing)}, vSpacing: ${num(n.vSpacing)}${stretch}) {`,
    ...t.cells.flatMap((c, i) => {
      const [top, bottom] = t.margins[i]!;
      const margin = [top ? `.padding(.top, ${num(top)})` : "", bottom ? `.padding(.bottom, ${num(bottom)})` : ""];
      return indent([...ctx.renderNode(n.children[c]!), ...margin.filter(Boolean)], 1);
    }),
    "}",
  ];
}

/**
 * Content-height rows need an intrinsic height proposal, or stretch children (and app `align-self` children with
 * `maxHeight: .infinity`) take all the height offered. Fixed/fill rows already get one; discarding it collapses
 * overlay-only Color children to their 10pt ideal height.
 */
function hugsRowHeight(n: StackNode, ctx: EmitContext): boolean {
  return (
    n.axis === "h" &&
    n.height.kind === "hug" &&
    n.children.some((k) => k.height.kind === "fill" || (ctx.mode === "app" && k.selfAlignV !== undefined))
  );
}

/** App mode: an admitted flex row (`StackNode.flex`) laid out by the runtime `MarkswiftFlexRow`. */
function flexRowExpr(n: StackNode, flex: NonNullable<StackNode["flex"]>, ctx: EmitContext): string[] {
  const items = flex.items.map((i) => {
    const extra = (["min", "max", "inset", "fraction"] as const).map((k) => {
      const v = i[k];
      return v === undefined ? "" : `, ${k}: ${num(v)}`;
    });
    return `.init(grow: ${num(i.grow)}, shrink: ${num(i.shrink)}, basis: ${i.basis === null ? "nil" : num(i.basis)}${extra.join("")})`;
  });
  const spacing = typeof n.spacing === "number" ? n.spacing : (n.spacing[0] ?? 0);
  const align = flex.align === "stretch" ? "" : `, align: .${flex.align}`;
  return [
    `MarkswiftFlexRow(items: [${items.join(", ")}], spacing: ${num(spacing)}${align}) {`,
    ...n.children.flatMap((c) => indent(ctx.renderNode(c), 1)),
    "}",
    ...(hugsRowHeight(n, ctx) ? [".fixedSize(horizontal: false, vertical: true)"] : []),
  ];
}

export function containerExpr(n: StackNode | GridNode, ctx: EmitContext): string[] {
  const out: string[] = [];
  // Fidelity keeps an admitted grid's captured geometry and reports what app mode reconstructs.
  if (n.kind === "grid" && n.template && ctx.mode === "fidelity")
    note(n, "approximated", n.measured ? "display: grid" : "grid-template-columns", n.template.fidelityNote);
  if (n.kind === "grid" && n.template && ctx.mode === "app") out.push(...tracksExpr(n, n.template, ctx));
  else if (n.measured) out.push(...measuredLayoutExpr(n, ctx));
  else if (n.kind === "stack" && n.wrap) out.push(...wrappingExpr(n, ctx));
  else if (n.kind === "stack" && n.flex && ctx.mode === "app") out.push(...flexRowExpr(n, n.flex, ctx));
  else if (n.kind === "grid") {
    out.push(
      `Grid(alignment: .topLeading, horizontalSpacing: ${num(n.hSpacing)}, verticalSpacing: ${num(n.vSpacing)}) {`,
    );
    for (let i = 0; i < n.children.length; i += n.columns) {
      out.push("    GridRow {");
      for (const c of n.children.slice(i, i + n.columns)) out.push(...indent(ctx.renderNode(c), 2));
      out.push("    }");
    }
    out.push("}");
  } else {
    // Fidelity keeps an admitted flex row's captured widths and reports what app mode reconstructs.
    if (n.flex?.fidelityNote) note(n, "approximated", n.flex.fidelityNote.feature, n.flex.fidelityNote.message);
    const kids = n.children;
    const uniform = typeof n.spacing === "number";
    const spacers = n.distribution === "between" || n.distribution === "around" || n.distribution === "evenly";
    // CSS auto margins (`ml-auto`, `mt-auto`) take the free space: flexible Spacers at those gaps.
    const auto = new Set(n.autoGaps ?? []);
    const gapAt = (i: number) => (typeof n.spacing === "number" ? n.spacing : (n.spacing[i - 1] ?? 0));
    const spacing = spacers || auto.size ? 0 : uniform ? (n.spacing as number) : 0;
    // Mode difference — HStack cross alignment. Fidelity: `.top` plus a per-child top padding
    // taken from the measured geometry, so placement does not depend on native text metrics.
    // App: the IR's cross alignment and no geometric padding; SwiftUI aligns natively.
    const geometry =
      ctx.mode === "fidelity" &&
      n.axis === "h" &&
      (n.align !== "stretch" || kids.some((k) => k.selfAlignV !== undefined));
    // `stretch` (the CSS default) puts a fixed-cross-size item at flex-start; filling ones stretch anyway.
    const align =
      n.axis === "v"
        ? horizontalAlignment(n.align)
        : geometry
          ? ".top"
          : n.align === "baseline"
            ? ".firstTextBaseline"
            : verticalAlignment(n.align);
    const ctor =
      n.axis === "v"
        ? `VStack(alignment: ${align}, spacing: ${num(spacing)})`
        : `HStack(alignment: ${align}, spacing: ${num(spacing)})`;
    out.push(`${ctor} {`);
    // Distribution as flexible spacers: `between` only between children; `around` one on each
    // side of every child (inner gaps twice the outer ones); `evenly` one before every child
    // plus one after the last (all gaps equal).
    const around = n.distribution === "around",
      evenly = n.distribution === "evenly";
    kids.forEach((c, i) => {
      if (auto.has(i)) out.push(`    Spacer(minLength: ${num(i === 0 ? n.leadInset : gapAt(i))})`);
      if ((i > 0 && n.distribution === "between") || around || evenly)
        out.push(`    Spacer(minLength: ${n.distribution === "between" && i > 0 && n.minGap ? num(n.minGap) : "0"})`);
      const lines = ctx.renderNode(c);
      const extra: string[] = [];
      if (geometry) {
        const dy = Math.round((c.frame.y - (n.frame.y + n.padding[0])) * 100) / 100;
        if (dy > 0.5) extra.push(`.padding(.top, ${num(dy)})`);
      }
      // Negative when the first child hangs outside the content box (outside markers, negative margins).
      if (i === 0 && n.leadInset !== 0 && !around && !evenly && !auto.has(0))
        extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num(n.leadInset)})`);
      if ((!uniform || auto.size) && !spacers && i > 0 && !auto.has(i))
        extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num(gapAt(i))})`);
      out.push(...indent([...lines, ...extra], 1));
      if (around || (evenly && i === kids.length - 1)) out.push("    Spacer(minLength: 0)");
      if (i === kids.length - 1 && auto.has(kids.length)) out.push("    Spacer(minLength: 0)");
    });
    out.push("}");
    if (hugsRowHeight(n, ctx)) out.push(".fixedSize(horizontal: false, vertical: true)");
  }
  // Mode difference — scrolling stacks. App: a real ScrollView on the IR axis carries the box's frame, paint,
  // border, rounded clip and `position: fixed` overlays (`boxModifiers`), so they stay put while the content
  // scrolls; the padding and other overlays scroll with the content, which fills a vertical ScrollView's width.
  if (n.scroll && ctx.mode === "app") {
    const scrolling = n.overlays.filter((o) => !o.fixed);
    const content = [
      ...out,
      ...paddingModifiers(n, ctx),
      ...(n.scroll === "v"
        ? [`.frame(minWidth: ${num(0)}, maxWidth: .infinity, alignment: ${fillAlignment(n, ctx.mode)})`]
        : []),
      ...scrolling
        .filter((o) => o.layer === "background")
        .reverse()
        .flatMap((o) => overlayModifier(o, "background", ctx)),
      ...scrolling.filter((o) => o.layer === "overlay").flatMap((o) => overlayModifier(o, "overlay", ctx)),
    ];
    return decorate(
      n,
      [
        `ScrollView(.${n.scroll === "h" ? "horizontal" : "vertical"}) {`,
        ...indent(content, 1),
        "}",
        ".markswiftScrollEdgeEffectHidden()",
      ],
      ctx,
    );
  }
  const body = decorate(n, out, ctx);
  // Fidelity: the first viewport as a fixed, clipped stack (ImageRenderer cannot render ScrollView).
  if (n.scroll)
    return [
      ...body,
      `.frame(width: ${num(n.frame.w)}, height: ${num(n.frame.h)}, alignment: .topLeading)`,
      ".clipped()",
    ];
  return body;
}
