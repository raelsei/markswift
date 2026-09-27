/** Places native text from measured baseline geometry rather than vertical centering. */
import type { FontSpec, TextNode } from "../model/semantic.ts";
import type { EmitMode } from "./context.ts";
import { num } from "./format.ts";

const weights = ["ultraLight", "thin", "light", "regular", "medium", "semibold", "bold", "heavy", "black"];

/** Match fontExpr's nearest named weight, including its lower-weight tie break. */
export function nativeTextWeight(font: FontSpec): string {
  const weight = weights.reduce((best, _, i) => Math.abs((i + 1) * 100 - font.weight) < Math.abs((best + 1) * 100 - font.weight) ? i : best, 0);
  return weights[weight]!;
}

export function textLineBoxExpr(node: TextNode, mode: EmitMode, content: string[], spacing: number, greedy = false, width?: number): string[] {
  const box = node.lineBox!, font = node.runs.find(run => run.gap === undefined)!.font;
  const height = node.frame.h - node.padding[0] - node.padding[2];
  const fallbackLeading = height >= node.lines * box.baselineStep - 0.5 && Math.abs(spacing) >= 0.5 ? spacing / 2 : 0;
  const args = [`firstBaseline: ${num(box.firstBaseline)}`, `baselineToBottom: ${num(box.baselineToBottom)}`,
    `baselineStep: ${num(box.baselineStep)}`, `fontSize: ${num(font.size)}`, `fontWeight: UIFont.Weight.${nativeTextWeight(font)}.rawValue`,
    `lineSpacing: ${num(Math.max(0, spacing))}`, `greedy: ${greedy}`, `fallbackLeading: ${num(fallbackLeading)}`,
    ...(node.align === "leading" ? [] : [`horizontal: .${node.align}`]),
    ...(mode === "fidelity" ? [`fixedHeight: ${num(height)}`, `expectedLines: ${box.baselines.length}`] : []),
    ...(width === undefined ? [] : [`fixedWidth: ${num(width)}`])];
  return [`MarkswiftTextLineBox(${args.join(", ")}) {`, ...content.map(line => `    ${line}`), "}"];
}
