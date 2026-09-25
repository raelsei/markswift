import type { SemNode } from "../model/semantic.ts";
/** Records an emit-time approximation on the node; idempotent because both modes emit the same tree. */
export declare function note(n: SemNode, text: string): void;
