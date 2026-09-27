import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, num, str } from "./format.ts";

/** Background and border stay at the same places in the shared modifier chain. */
export function fieldsetFillModifiers(node: SemNode, shape: string, ctx: EmitContext): string[] {
  const fieldset = node.fieldsetPaint;
  if (!fieldset) return [];
  return [...node.style.fills].reverse().flatMap(fill => fill.kind === "solid" ? [
    `.modifier(MarkswiftFieldsetBackground(legendKey: ${str(fieldset.key)}, shape: ${shape}, fill: ${colorExpr(fill.color, ctx, node.id)}, borderWidth: ${num(node.style.border?.width ?? 0)}))`,
  ] : []);
}

export function fieldsetBorderModifiers(node: SemNode, shape: string, ctx: EmitContext): string[] {
  const border = node.style.border, fieldset = node.fieldsetPaint;
  return border && fieldset ? [`.modifier(MarkswiftFieldsetBorder(legendKey: ${str(fieldset.key)}, shape: ${shape}, color: ${colorExpr(border.color, ctx, node.id)}, width: ${num(border.width)}))`] : [];
}

export function fieldsetLegendModifier(node: SemNode): string[] {
  const legend = node.fieldsetLegend;
  return legend ? [`.markswiftFieldsetLegend(${str(legend.key)}, relativeX: ${num(legend.relativeOffset[0])}, relativeY: ${num(legend.relativeOffset[1])})`] : [];
}
