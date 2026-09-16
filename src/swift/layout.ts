import type { StackNode, GridNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";
import { modifiers } from "./modifiers.ts";
export function containerExpr(n: StackNode | GridNode, ctx: EmitContext): string[] {
  const out: string[] = [];
  if (n.kind === "grid") {
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
        const dy = Math.round((c.frame.y - (n.frame.y + n.padding[0])) * 100) / 100;
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
  out.push(...modifiers(n, ctx));
  if (n.kind === "stack" && n.scroll) {
    // Mode difference — scrolling stacks. Fidelity: the first viewport as a fixed, clipped
    // stack (ImageRenderer cannot render ScrollView). App: a real ScrollView on the IR axis.
    if (ctx.mode === "fidelity") return [...out, `.frame(width: ${num(n.frame.w)}, height: ${num(n.frame.h)}, alignment: .topLeading)`, ".clipped()"];
    return [`ScrollView(.${n.scroll === "h" ? "horizontal" : "vertical"}, showsIndicators: false) {`, ...indent(out, 1), `}`];
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
