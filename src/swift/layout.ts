import type { StackNode, GridNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";
import { modifiers } from "./modifiers.ts";
import { measuredLayoutExpr } from "./measured-layout.ts";
import { wrappingExpr } from "./wrapping.ts";
import { weightedLayoutExpr } from "./allocation-layout.ts";
import { tableExpr } from "./table-layout.ts";
import { geometryAlias } from "./geometry-observation.ts";
import { note } from "./diagnostics.ts";
import { flowFrame } from "../analysis/relative-position.ts";
import { intrinsicFlexExpr } from "./intrinsic-flex.ts";
export function containerExpr(n: StackNode | GridNode, ctx: EmitContext): string[] {
  const out: string[] = [];
  if (n.kind === "stack" && n.table) out.push(...tableExpr(n, ctx));
  else if (ctx.mode === "app" && n.kind === "stack" && n.intrinsicFlex) out.push(...intrinsicFlexExpr(n, ctx));
  else if (ctx.mode === "app" && (n.kind === "stack" ? n.allocation : n.tracks)) out.push(...weightedLayoutExpr(n, ctx));
  else if (n.measured) out.push(...measuredLayoutExpr(n, ctx));
  else if (n.kind === "stack" && n.wrap) out.push(...wrappingExpr(n, ctx));
  else if (n.kind === "grid") {
    out.push(`Grid(alignment: .topLeading, horizontalSpacing: ${num(n.hSpacing)}, verticalSpacing: ${num(n.vSpacing)}) {`);
    for (let i = 0; i < n.children.length; i += n.columns) {
      out.push("    GridRow {");
      for (const c of n.children.slice(i, i + n.columns)) out.push(...indent(ctx.renderNode(c).split("\n"), 2));
      out.push("    }");
    }
    out.push("}");
  } else {
    const kids = n.children;
    const uniform = typeof n.spacing === "number";
    const spacers = n.distribution === "between" || n.distribution === "around" || n.distribution === "evenly";
    const spacing = spacers ? 0 : uniform ? (n.spacing as number) : 0;
    // Mode difference — HStack cross alignment. Fidelity: `.top` plus a per-child top padding
    // taken from the measured geometry, so placement does not depend on native text metrics.
    // App: the IR's cross alignment (`hAlign`) and no geometric padding; SwiftUI aligns natively.
    const geometry = ctx.mode === "fidelity" && n.axis === "h" && n.align !== "stretch";
    const align = n.axis === "v" ? vAlign(n.align) : geometry ? ".top" : hAlign(n.align);
    const ctor = n.axis === "v" ? `VStack(alignment: ${align}, spacing: ${num(spacing)})` : `HStack(alignment: ${align}, spacing: ${num(spacing)})`;
    out.push(`${ctor} {`);
    // Distribution as flexible spacers: `between` only between children; `around` one on each
    // side of every child (inner gaps twice the outer ones); `evenly` one before every child
    // plus one after the last (all gaps equal).
    const around = n.distribution === "around", evenly = n.distribution === "evenly";
    kids.forEach((c, i) => {
      if ((i > 0 && n.distribution === "between") || around || evenly) out.push("    Spacer(minLength: 0)");
      const lines = ctx.renderNode(c).split("\n");
      const extra: string[] = [];
      if (geometry) {
        const dy = Math.round((flowFrame(c).y - (n.frame.y + n.padding[0])) * 100) / 100;
        if (dy > 0.5) extra.push(`.padding(.top, ${num(dy)})`);
      }
      // Negative when the first child hangs outside the content box (outside markers, negative margins).
      if (i === 0 && n.leadInset !== 0 && !around && !evenly) extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num(n.leadInset)})`);
      if (!uniform && !spacers && i > 0) extra.push(`.padding(${n.axis === "v" ? ".top" : ".leading"}, ${num((n.spacing as number[])[i - 1] ?? 0)})`);
      out.push(...indent([...lines, ...extra], 1));
      if (around || (evenly && i === kids.length - 1)) out.push("    Spacer(minLength: 0)");
    });
    out.push("}");
    // Only content-height rows need an intrinsic proposal to keep stretch children from
    // consuming all available height. Fixed/fill rows already receive a height proposal;
    // discarding it collapses overlay-only Color children to their 10pt ideal height.
    if (n.axis === "h" && n.height.kind === "hug" && kids.some((k) => k.height.kind === "fill")) out.push(".fixedSize(horizontal: false, vertical: true)");
  }
  if (n.kind === "stack" && n.scroll && ctx.mode === "app") {
    // CSS width/height and paint belong to the viewport. Padding and positioned children
    // remain in its scrollable content; the scroll axis must measure its full natural extent.
    const content: StackNode = { ...n, style: { fills: [], shadows: [] }, selfAlign: undefined, relativeOffset: undefined };
    const naturalExtent = !n.measured && !n.wrap && n.distribution === "start"
      && (n.scroll === "v" ? n.axis === "v" : n.axis === "h" && !n.allocation);
    if (naturalExtent && n.scroll === "v") {
      content.height = { kind: "hug" }; delete content.minHeight; delete content.maxHeight;
    } else if (naturalExtent) {
      content.width = { kind: "hug" }; delete content.minWidth; delete content.maxWidth;
    } else {
      note(n, "approximated: constrained scroll content retains captured extent; native scroll range may differ");
    }
    geometryAlias(content, n, ctx.geometry);
    out.push(...modifiers(content, ctx));
    const viewport: StackNode = { ...n, padding: [0, 0, 0, 0], overlays: [] };
    geometryAlias(viewport, n, ctx.geometry, true);
    return [`ScrollView(.${n.scroll === "h" ? "horizontal" : "vertical"}, showsIndicators: false) {`, ...indent(out, 1), "}", ...modifiers(viewport, ctx)];
  }
  out.push(...modifiers(n, ctx));
  if (n.kind === "stack" && n.scroll) {
    // Mode difference — scrolling stacks. Fidelity: the first viewport as a fixed, clipped
    // stack (ImageRenderer cannot render ScrollView). App: a real ScrollView on the IR axis.
    return [...out, `.frame(width: ${num(n.frame.w)}, height: ${num(n.frame.h)}, alignment: .topLeading)`, ".clipped()"];
  }
  return out;
}

function vAlign(a: StackNode["align"]): string {
  return a === "center" ? ".center" : a === "end" ? ".trailing" : ".leading";
}
function hAlign(a: StackNode["align"]): string {
  // `stretch` (the CSS default) puts a fixed-cross-size item at flex-start; filling ones stretch anyway.
  return a === "center" ? ".center" : a === "end" ? ".bottom" : a === "baseline" ? ".firstTextBaseline" : ".top";
}
