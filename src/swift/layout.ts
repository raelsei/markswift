import type { StackNode, GridNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { note } from "./diagnostics.ts";
import { horizontalAlignment, indent, num, verticalAlignment } from "./format.ts";
import { decorate, overlayModifier } from "./modifiers.ts";
import { measuredLayoutExpr } from "./measured-layout.ts";
import { wrappingExpr } from "./wrapping.ts";

/** App mode: an admitted authored template (`GridNode.template`) laid out by the runtime `MarkswiftTracks`. */
function tracksExpr(n: GridNode, t: NonNullable<GridNode["template"]>, ctx: EmitContext): string[] {
  const layout = t.autoRepeat
    ? `autoRepeat: .${t.autoRepeat.mode}(min: ${num(t.autoRepeat.min)})`
    : `tracks: [${t.tracks.map((k) => (k.kind === "auto" ? ".auto" : k.kind === "px" ? `.px(${num(k.px)})` : `.fr(${num(k.fr)})`)).join(", ")}]`;
  const stretch = t.stretch ? "" : ", stretch: false";
  return [
    `MarkswiftTracks(${layout}, hSpacing: ${num(n.hSpacing)}, vSpacing: ${num(n.vSpacing)}${stretch}) {`,
    ...n.children.flatMap((c) => indent(ctx.renderNode(c), 1)),
    "}",
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
    // Only content-height rows need an intrinsic proposal to keep stretch children from
    // consuming all available height (and `align-self` children their `maxHeight: .infinity`).
    // Fixed/fill rows already receive a height proposal; discarding it collapses overlay-only
    // Color children to their 10pt ideal height.
    if (
      n.axis === "h" &&
      n.height.kind === "hug" &&
      kids.some((k) => k.height.kind === "fill" || (ctx.mode === "app" && k.selfAlignV !== undefined))
    )
      out.push(".fixedSize(horizontal: false, vertical: true)");
  }
  const body = decorate(n, out, ctx);
  if (n.scroll) {
    // Mode difference — scrolling stacks. Fidelity: the first viewport as a fixed, clipped
    // stack (ImageRenderer cannot render ScrollView). App: a real ScrollView on the IR axis,
    // with `position: fixed` overlays attached outside it so they stay put while content scrolls.
    if (ctx.mode === "fidelity")
      return [
        ...body,
        `.frame(width: ${num(n.frame.w)}, height: ${num(n.frame.h)}, alignment: .topLeading)`,
        ".clipped()",
      ];
    // Same chain order as `modifiers`: front-most background first.
    const fixed = [
      ...n.overlays.filter((o) => o.fixed && o.layer === "background").reverse(),
      ...n.overlays.filter((o) => o.fixed && o.layer === "overlay"),
    ].flatMap((o) => overlayModifier(o, o.layer, ctx));
    return [
      `ScrollView(.${n.scroll === "h" ? "horizontal" : "vertical"}) {`,
      ...indent(body, 1),
      `}`,
      ".markswiftScrollEdgeEffectHidden()",
      ...fixed,
    ];
  }
  return body;
}
