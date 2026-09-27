/** Intrinsic plain-word flex rows; other allocation families retain their own admission. */
import type { LayoutNode } from "../model/layout.ts";
import type { CrossAlign, Distribution, SemBase, SemNode, StackNode, TextNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
/** Decorations preserve advances; at most two plain words cannot trigger native balancing. */
export declare function isIntrinsicFlexCaption(node: TextNode): boolean;
export declare function intrinsicFlexText(node: SemNode, wrapping: boolean): TextNode | undefined;
type IntrinsicFlexAdmission = NonNullable<StackNode["intrinsicFlex"]> | {
    fontFallback: string;
};
export declare function intrinsicFlex(n: LayoutNode, base: SemBase, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): IntrinsicFlexAdmission | undefined;
/** Both emit modes share children; only app dispatch uses the intrinsic allocation. */
export declare function buildIntrinsicFlex(n: LayoutNode, base: SemBase, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): StackNode | undefined;
export {};
