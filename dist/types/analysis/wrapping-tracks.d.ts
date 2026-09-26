/** A narrow CSS identity: N equal border-box calc tracks plus pixel gaps fill each row. */
import type { LayoutNode } from "../model/layout.ts";
import type { SemBase } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
export declare function equalWrappingColumns(n: LayoutNode, base: SemBase, items: AnalyzedChild[], columnGap: number | undefined): number | undefined;
