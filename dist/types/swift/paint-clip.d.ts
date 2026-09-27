import type { Paint } from "../css/paint.ts";
import type { SemNode } from "../model/semantic.ts";
/** CSS clipping changes visible alpha, independently of the background gradient's coordinates. */
export declare function backgroundClip(p: Paint, n: SemNode, shape: string, inset: string): string;
