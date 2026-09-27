import type { BundledFamily } from "../model/fonts.ts";
export type OpticalSizeSelection = {
    kind: "absent";
} | {
    kind: "auto";
} | {
    kind: "none";
    value: number;
} | {
    kind: "unavailable";
    reason: string;
};
/** Qualifies a source default separately from the existing automatic font-size route. */
export declare function selectOpticalSize(style: Record<string, string>, family: BundledFamily): OpticalSizeSelection;
