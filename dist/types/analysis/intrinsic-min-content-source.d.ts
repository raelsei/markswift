import type { LayoutNode } from "../model/layout.ts";
import type { SemNode, TextNode } from "../model/semantic.ts";
import type { AnalyzedChild, SourceTextRun, InferenceContext } from "./context.ts";
type ContentSource = {
    kind: "text";
    source: LayoutNode;
    runs: SourceTextRun[];
    leaf: boolean;
} | {
    kind: "container";
    source: LayoutNode;
    items: AnalyzedChild[];
} | {
    kind: "control";
    source: LayoutNode;
};
export type IntrinsicSource = ContentSource & {
    context: Pick<InferenceContext, "parent" | "parentDisplay" | "parentAxis">;
};
export declare function intrinsicSource(node: SemNode): IntrinsicSource | undefined;
export declare function joinIntrinsicText(source: LayoutNode, node: TextNode, runs: SourceTextRun[], leaf: boolean, context: InferenceContext): void;
export declare function joinIntrinsicContainer(source: LayoutNode, node: SemNode, items: AnalyzedChild[], context: InferenceContext): void;
export declare function joinIntrinsicControl(source: LayoutNode, node: SemNode, context: InferenceContext): void;
export {};
