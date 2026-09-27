import type { LayoutNode } from "../model/layout.ts";
import type { SemNode, TextNode } from "../model/semantic.ts";
import type { AnalyzedChild, SourceTextRun, InferenceContext } from "./context.ts";

type ContentSource =
  | { kind: "text"; source: LayoutNode; runs: SourceTextRun[]; leaf: boolean }
  | { kind: "container"; source: LayoutNode; items: AnalyzedChild[] }
  | { kind: "control"; source: LayoutNode };
export type IntrinsicSource = ContentSource & { context: Pick<InferenceContext, "parent" | "parentDisplay" | "parentAxis"> };

// Object identity is the join. Weak keys keep this conversion-local association out of IR.
const sources = new WeakMap<SemNode, IntrinsicSource>();
export function intrinsicSource(node: SemNode): IntrinsicSource | undefined { return sources.get(node); }
export function joinIntrinsicText(source: LayoutNode, node: TextNode, runs: SourceTextRun[], leaf: boolean, context: InferenceContext): void {
  sources.set(node, { kind: "text", source, runs: [...runs], leaf, context });
}
export function joinIntrinsicContainer(source: LayoutNode, node: SemNode, items: AnalyzedChild[], context: InferenceContext): void {
  sources.set(node, { kind: "container", source, items: [...items], context });
}
export function joinIntrinsicControl(source: LayoutNode, node: SemNode, context: InferenceContext): void { sources.set(node, { kind: "control", source, context }); }
