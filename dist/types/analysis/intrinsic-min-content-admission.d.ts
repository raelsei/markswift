import type { LayoutNode } from "../model/layout.ts";
import type { SemNode } from "../model/semantic.ts";
export declare const fixedPx: (value: string | undefined) => boolean;
export declare function intrinsicContainmentReason(source: LayoutNode): string | undefined;
/** Common ordinary-box boundary. Atomic controls have a separate fixed-box proof. */
export declare function ordinaryIntrinsicReason(source: LayoutNode, sem: SemNode, root?: boolean): string | undefined;
