import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { textExpr } from "./text.ts";
import { svgExpr } from "./svg.ts";
import { imageNodeExpr } from "./images.ts";
import { controlExpr } from "./controls.ts";
import { modifiers } from "./modifiers.ts";
/** Lines for a node: container → property reference; leaf → inline expression (with modifiers). */
export function refOf(n: SemNode, ctx: EmitContext): string[] {
  if (n.kind === "stack" || n.kind === "grid") return [ctx.nameOf.get(n)!];
  return leafExpr(n, ctx);
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
    case "control":
      core = controlExpr(n, { child: ctx.renderNode, stateOf: ctx.control.stateOf, actionOf: ctx.control.actionOf, mode: ctx.mode, theme: ctx.adaptive ? "adaptive" : ctx.screen.theme, tokens: ctx.tokens, id: n.id });
      break;
    case "box":
      core = ["Color.clear"];
      break;
    default:
      core = ["EmptyView()"];
  }
  return [...core, ...modifiers(n, ctx)];
}
