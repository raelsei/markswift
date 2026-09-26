import type { Raw } from "./snapshot-types.ts";
/** Effective disabled state includes fieldsets; their first legend subtree stays enabled. */
export declare function applyInheritedDisabledState(nodes: Raw[]): void;
