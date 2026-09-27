/** A bounded fixed-table model: authored track rules must reproduce every captured cell. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableLayout } from "../model/table.ts";
import type { SemBase, SemNode, StackNode } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { type TableMember } from "./table-structure.ts";
export interface NativeTableAnalysis {
    layout: TableLayout;
    members: TableMember[];
    collapsed: boolean;
}
export declare function buildNativeTable(table: LayoutNode, base: SemBase, ctx: InferenceContext, build: (node: LayoutNode, ctx: InferenceContext) => SemNode): StackNode | undefined;
export declare function tableFallbackReason(table: LayoutNode): string | undefined;
export declare function analyzeNativeTable(table: LayoutNode, parent?: LayoutNode): NativeTableAnalysis | undefined;
