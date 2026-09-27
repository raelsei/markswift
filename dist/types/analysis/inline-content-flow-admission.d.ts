import type { LayoutNode } from "../model/layout.ts";
import type { StackNode } from "../model/semantic.ts";
import type { IntrinsicSource } from "./intrinsic-min-content-source.ts";
export declare function autoHeightReason(n: LayoutNode, stack: StackNode): string | undefined;
export declare function inlineRowReason(joined: IntrinsicSource, stack: StackNode): string | undefined;
export declare function inlineWordsReason(n: LayoutNode): string | undefined;
