import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { textExpr } from "./text.ts";
import { svgExpr } from "./svg.ts";
import { imageNodeExpr } from "./images.ts";
import { controlExpr } from "./controls.ts";
import { boxModifiers, decorate, hitTestingModifier, placementModifiers } from "./modifiers.ts";
import { indent } from "./format.ts";
/** Lines for a node: container → property reference; leaf → inline expression (with modifiers); holder → band chain. */
export function refOf(n: SemNode, ctx: EmitContext): string[] {
  if (n.alternatives) return bandChain(n.alternatives, ctx);
  if (n.kind === "stack" || n.kind === "grid") return [ctx.nameOf.get(n)! + (ctx.bandParam.has(n) ? "(band)" : "")];
  return leafExpr(n, ctx);
}

/**
 * The alternative the current band selects, tested from the highest lowest-band down; the one holding the holder's
 * lowest band is the plain `else`. `band >= a` when the member holds every band from `a` up that is still untested.
 */
function bandChain(alternatives: SemNode[], ctx: EmitContext): string[] {
  let untested = alternatives.flatMap((a) => a.bands!);
  const lines: string[] = [];
  for (let i = alternatives.length - 1; i > 0; i--) {
    const bands = alternatives[i]!.bands!;
    const test =
      untested.filter((b) => b >= bands[0]!).length === bands.length
        ? `band >= ${bands[0]}`
        : `[${bands.join(", ")}].contains(band)`;
    lines.push(
      `${i === alternatives.length - 1 ? "if" : "} else if"} ${test} {`,
      ...indent(ctx.renderNode(alternatives[i]!), 1),
    );
    untested = untested.filter((b) => !bands.includes(b));
  }
  lines.push("} else {", ...indent(ctx.renderNode(alternatives[0]!), 1), "}");
  return ["Group {", ...indent(lines, 1), "}"];
}

function leafExpr(n: SemNode, ctx: EmitContext): string[] {
  let core: string[];
  switch (n.kind) {
    case "text":
      core = textExpr(n, ctx);
      break;
    case "svg":
      core = svgExpr(n, ctx.shapes, ctx, n.id);
      break;
    case "image":
      core = imageNodeExpr(n, ctx);
      break;
    case "control": {
      // A button's or link's box goes inside its label: the box is the hit and press area.
      const pressable = n.control === "button" || n.control === "link";
      core = controlExpr(n, {
        child: ctx.renderNode,
        stateOf: ctx.control.stateOf,
        actionOf: ctx.control.actionOf,
        radioTag: ctx.control.radioTag,
        mode: ctx.mode,
        theme: ctx.adaptive ? "adaptive" : ctx.screen.theme,
        tokens: ctx.tokens,
        scaledFonts: ctx.scaledFonts,
        statePaint: ctx.control.statePaint,
        pressOf: ctx.control.pressOf,
        toggleOf: ctx.control.toggleOf,
        openOf: ctx.control.openOf,
        focusOf: ctx.control.focusOf,
        fontMetrics: ctx.fontMetrics,
        id: n.id,
        ...(pressable ? { box: boxModifiers(n, ctx) } : {}),
      });
      if (pressable) return [...core, ...placementModifiers(n, ctx), ...hitTestingModifier(n, ctx)];
      break;
    }
    case "box":
      core = ["Color.clear"];
      break;
    default:
      core = ["EmptyView()"];
  }
  return decorate(n, core, ctx);
}
