import type { SemNode } from "../model/semantic.ts";
export declare const visit: (n: SemNode, fn: (n: SemNode) => void) => void;
