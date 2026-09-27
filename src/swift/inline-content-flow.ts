import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, indent, num, str } from "./format.ts";
import { nativeTextWeight } from "./text-line-box.ts";
import { inlineCaptionKeys } from "./inline-content-flow-observation.ts";

export function inlineContentExpr(node: StackNode, ctx: EmitContext): string[] {
  const flow = node.inlineContentFlow!, caption = node.children[flow.caption]!;
  if (caption.kind !== "text") throw new Error("Admitted inline caption ownership changed");
  const run = caption.runs[0]!, box = flow.lineBox;
  const font = `UIFont.systemFont(ofSize: ${num(run.font.size)}, weight: .${nativeTextWeight(run.font)})`;
  const keys = inlineCaptionKeys(caption, flow.tokens, ctx.text), words = flow.tokens.filter(token => token.kind === "word");
  const margins = flow.widgetMargins.map(num).join(", ");
  const tokenKeys = (kind: "word" | "separator") => flow.tokens.flatMap((token, index) => token.kind === kind && keys[index] ? [str(keys[index]!)] : []).join(", ");
  const ranges = (kind: "word" | "separator") => flow.tokens.filter(token => token.kind === kind).map(token => `[${token.rawRange.join(", ")}]`).join(", ");
  const observation = ctx.text ? `, wordKeys: [${tokenKeys("word")}], separatorKeys: [${tokenKeys("separator")}], wordRanges: [${ranges("word")}], separatorRanges: [${ranges("separator")}]` : "";
  const out = [`MarkswiftInlineContentRow(id: ${str(node.id)}, strutAscent: ${num(flow.strutAscent)}, strutDescent: ${num(flow.strutDescent)}, wordCount: ${words.length}, space: MarkswiftTextAdvance.width(" ", font: ${font}), margins: [${margins}], textBaseline: ${num(box.firstBaseline)}, textDescent: ${num(box.baselineToBottom)}${observation}) {`];
  out.push(...indent(ctx.renderNode(node.children[flow.widget]!).split("\n"), 1));
  for (const [index, token] of flow.tokens.entries()) {
    if (token.kind !== "word") continue;
    let text = `Text(verbatim: ${str(token.value)}).font(Font(${font})).foregroundStyle(${colorExpr(run.color, ctx, caption.id)})`;
    if (ctx.text) text += `.markswiftTextSource(${str(keys[index]!)}, ${str(token.value)}, fontBinding: "shared-supplied-ui-font:" + ${font}.fontName).markswiftObserveText(${str(keys[index]!)})`;
    const wrapper = [`MarkswiftTextLineBox(firstBaseline: ${num(box.firstBaseline)}, baselineToBottom: ${num(box.baselineToBottom)}, baselineStep: ${num(box.baselineStep)}, fontSize: ${num(run.font.size)}, fontWeight: UIFont.Weight.${nativeTextWeight(run.font)}.rawValue, lineSpacing: 0) {`,
      `    ${text}.fixedSize(horizontal: true, vertical: true)`, "}",
      `.layoutValue(key: MarkswiftInlineContentAdvance.self, value: MarkswiftTextAdvance.width(${str(token.value)}, font: ${font}))`];
    out.push(...indent(wrapper, 1));
  }
  out.push("}"); return out;
}
