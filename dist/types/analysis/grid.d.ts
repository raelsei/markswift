/** Native-grid admission is proven from resolved tracks and captured cell geometry. */
import type { LayoutNode } from "../model/layout.ts";
import type { GridNode, SemBase } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
export declare function buildGrid(n: LayoutNode, base: SemBase, all: AnalyzedChild[]): GridNode;
