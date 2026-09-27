import type { InlineContentFlow, InlineContentToken } from "../model/inline-content-flow.ts";
import type { StackNode } from "../model/semantic.ts";
import { intrinsicSource } from "./intrinsic-min-content-source.ts";
import { usesGreedyWords } from "./text-flow-admission.ts";

export function inlineContentOf(stack: StackNode): InlineContentFlow | undefined {
  const joined = intrinsicSource(stack), baseline = stack.inlineBaseline;
  if (joined?.kind !== "container" || !baseline || joined.items.length !== 2 || stack.children.length !== 2) return;
  const [widget, caption] = stack.children, source = caption && intrinsicSource(caption);
  if (!widget || widget.kind !== "control" || !caption || caption.kind !== "text" || !caption.lineBox || !usesGreedyWords(caption)
    || source?.kind !== "text" || source.leaf || source.source !== joined.source || source.runs.length !== 1
    || caption.runs.length !== 1 || caption.padding.some(Boolean)) return;
  const rawNode = source.runs[0]!.node, raw = rawNode.text ?? "", widgetSource = intrinsicSource(widget)?.source;
  if (rawNode.tag !== "#text" || source.runs[0]!.styleOf !== joined.source || joined.source.children.length !== 2
    || joined.source.children[0] !== widgetSource || joined.source.children[1] !== rawNode
    || !/^ [A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(raw) || raw.slice(1) !== caption.runs[0]!.text) return;
  const claim = rawNode.textSource;
  if (claim && (claim.origin !== "dom" || claim.join !== "verified" || claim.raw !== raw)) return;
  const tokens: InlineContentToken[] = [...raw.matchAll(/ +|[^ ]+/g)].map(match => {
    const start = match.index!, value = match[0], end = start + value.length;
    return { kind: value === " " ? "separator" : "word", value, rawRange: [start, end],
      ...(claim ? { source: { version: 1 as const, units: [{ output: [0, value.length] as [number, number], sources: [{ occurrence: claim.key, start, end }], operation: "copy" as const }], excluded: [], unavailable: [] } } : {}) };
  });
  const margins = widgetSource?.inlineControlMargins;
  if (!margins || !margins.every(value => Number.isFinite(value) && value >= 0)) return;
  return { widget: 0, caption: 1, raw, tokens, lineBox: caption.lineBox, strutAscent: baseline.strutAscent,
    strutDescent: baseline.strutDescent, sourceInsets: baseline.sourceInsets, widgetMargins: margins };
}
