import type { IntrinsicWidth } from "../model/intrinsic-width.ts";
import type { SemNode } from "../model/semantic.ts";
export type WidthResult = {
    program: IntrinsicWidth;
    reason?: undefined;
} | {
    reason: string;
    program?: undefined;
};
export declare function intrinsicContribution(node: SemNode, root?: boolean, grouped?: boolean): WidthResult;
