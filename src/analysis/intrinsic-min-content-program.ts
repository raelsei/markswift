import type { IntrinsicWidth } from "../model/intrinsic-width.ts";
import type { SemNode, TextNode } from "../model/semantic.ts";
import { insetsOf } from "./geometry.ts";
import { usesGreedyWords } from "./text-flow-admission.ts";
import { fieldsetAdmission } from "./fieldset-paint.ts";
import { ordinaryIntrinsicReason, fixedPx, intrinsicContainmentReason } from "./intrinsic-min-content-admission.ts";
import { intrinsicSource, type IntrinsicSource } from "./intrinsic-min-content-source.ts";

export type WidthResult = { program: IntrinsicWidth; reason?: undefined } | { reason: string; program?: undefined };
const maximum = (children: IntrinsicWidth[]): IntrinsicWidth => ({ kind: "maximum", children });
const inset = (value: number, content: IntrinsicWidth): IntrinsicWidth => value ? { kind: "inset", value, content } : content;
const sourceInset = (source: IntrinsicSource) => { const p = insetsOf(source.source.styles); return p[1] + p[3]; };

function textContribution(node: TextNode, joined: Extract<IntrinsicSource, { kind: "text" }>): WidthResult {
  if (!node.lineBox || !usesGreedyWords(node)) return { reason: "plain whole-word shared native font route unavailable" };
  const [run] = joined.runs, literal = node.runs[0]!.text;
  if (joined.runs.length !== 1 || !run || run.node.tag !== "#text" || run.styleOf !== joined.source
    || !joined.source.children.includes(run.node) || (run.node.textSource && (run.node.textSource.origin !== "dom"
      || run.node.textSource.join !== "verified" || run.node.textSource.raw !== run.node.text)))
    return { reason: "single direct source text/run ownership unavailable" };
  if (joined.source.styles["white-space"] !== "normal" || !/^ ?[A-Za-z0-9]+(?: [A-Za-z0-9]+)* ?$/.test(run.node.text ?? "")
    || (run.node.text ?? "").trim() !== literal) return { reason: "source word normalization/break grouping unavailable" };
  return { program: inset(joined.leaf ? sourceInset(joined) : 0, { kind: "words", text: literal, font: node.runs[0]!.font }) };
}

function widgetContribution(node: SemNode, joined: IntrinsicSource): WidthResult {
  const n = joined.source, margins = n.inlineControlMargins;
  if (joined.kind !== "control" || n.tag !== "input" || !/^(checkbox|radio)$/.test(n.attrs.type ?? "")
    || node.kind !== "control" || !/^(toggle|radio)$/.test(node.control) || node.content.length || node.label
    || node.width.kind !== "fixed" || node.height.kind !== "fixed" || node.width.px !== node.height.px || ![13, 16].includes(node.width.px)
    || n.bounds.w !== node.width.px || n.bounds.h !== node.height.px
    || n.styles.appearance !== "auto" || node.padding.some(Boolean) || n.children.length || !margins
    || !margins.every(value => Number.isFinite(value) && value >= 0)
    || !["left", "right"].every(edge => fixedPx(n.styles[`margin-${edge}`]))
    || !n.preferredSize?.horizontalAutoMargins || n.preferredSize.horizontalAutoMargins.some(Boolean)
    || !/^(auto|13px|16px)$/.test(n.preferredSize.width) || (n.styles.position ?? "static") !== "static" || (n.styles.float ?? "none") !== "none"
    || (n.styles.transform && n.styles.transform !== "none") || (n.styles["aspect-ratio"] && n.styles["aspect-ratio"] !== "auto")
    || !/^(auto|0px)$/.test(n.styles["min-width"] ?? "") || n.styles["max-width"] !== "none")
    return { reason: "fixed native checkbox/radio outer contribution unavailable" };
  if (margins[1] !== parseFloat(n.styles["margin-right"]!) || margins[3] !== parseFloat(n.styles["margin-left"]!))
    return { reason: "widget physical margin ownership mismatch" };
  return { program: { kind: "fixed", value: node.width.px + margins[1] + margins[3] } };
}

function inlineContribution(node: SemNode, joined: Extract<IntrinsicSource, { kind: "container" }>): WidthResult {
  if (node.kind !== "stack" || joined.items.length !== 2 || node.children.length !== 2) return { reason: "inline source topology unavailable" };
  const widget = joined.items.find(item => item.sem.kind === "control"), text = joined.items.find(item => item.sem.kind === "text");
  const textSource = text && intrinsicSource(text.sem);
  if (!widget || !text || textSource?.kind !== "text" || textSource.leaf || textSource.source !== joined.source
    || joined.source.children.length !== 2 || joined.source.children[0] !== widget.node || joined.source.children[1] !== textSource.runs[0]?.node
    || !(textSource.runs[0]?.node.text ?? "").startsWith(" ")) return { reason: "widget source separator/break ownership unavailable" };
  const a = intrinsicContribution(widget.sem), b = intrinsicContribution(text.sem, false, true);
  return a.reason ? a : b.reason ? b : { program: inset(sourceInset(joined), maximum([a.program!, b.program!])) };
}

function blockContribution(node: SemNode, joined: Extract<IntrinsicSource, { kind: "container" }>): WidthResult {
  if (node.kind !== "stack" || node.axis !== "v" || node.children.length !== joined.items.length
    || node.measured || node.allocation || node.intrinsicFlex || node.wrap || node.scroll) return { reason: "ordinary source block topology unavailable" };
  const sources = joined.source.children;
  if (sources.length !== joined.items.length || joined.items.some(item => !sources.includes(item.node)
    || !node.children.includes(item.sem) || intrinsicSource(item.sem)?.source !== item.node)) return { reason: "direct block source/semantic ownership unavailable" };
  if (joined.source.tag === "fieldset") {
    const admitted = fieldsetAdmission(joined.source, node.style), legend = admitted.legend;
    const pair = joined.items.find(item => item.node === legend);
    if (admitted.reason || !legend || !node.fieldsetPaint || !pair || pair.sem.fieldsetLegend?.key !== node.fieldsetPaint.key
      || sources.filter(source => source.tag === "legend").length !== 1) return { reason: "rendered legend/anonymous content ownership unavailable" };
  }
  const children: IntrinsicWidth[] = [];
  for (const item of joined.items) {
    const result = intrinsicContribution(item.sem);
    if (result.reason) return result;
    children.push(result.program!);
  }
  return { program: inset(sourceInset(joined), maximum(children)) };
}

export function intrinsicContribution(node: SemNode, root = false, grouped = false): WidthResult {
  const joined = intrinsicSource(node);
  if (!joined) return { reason: "source/semantic join unavailable" };
  if (root && (!joined.context.parent || joined.context.parentAxis !== "v"
    || !/^(block|flow-root)$/.test(joined.context.parentDisplay ?? "")
    || !/^(block|flow-root)$/.test(joined.context.parent.styles.display ?? "")))
    return { reason: "ordinary containing-block context unavailable; flex/grid/table or standalone root is unproved" };
  if (root) {
    const reason = intrinsicContainmentReason(joined.context.parent!);
    if (reason) return { reason: `containing block ${reason}` };
  }
  if (root && ["min-width", "max-width"].some(key => /^(?:min-content|max-content|fit-content)/.test(joined.context.parent!.styles[key] ?? "")))
    return { reason: "containing block has an unproved intrinsic width constraint" };
  if (root && node.kind === "control") return { reason: "atomic controls are only fixed descendant contributions" };
  if (node.kind === "control") return widgetContribution(node, joined);
  if (!grouped) {
    const reason = ordinaryIntrinsicReason(joined.source, node, root);
    if (reason) return { reason };
  }
  if (joined.kind === "text" && node.kind === "text") return textContribution(node, joined);
  if (joined.kind !== "container") return { reason: "ordinary source content unavailable" };
  if (node.kind === "stack" && node.axis === "h") return inlineContribution(node, joined);
  return blockContribution(node, joined);
}
