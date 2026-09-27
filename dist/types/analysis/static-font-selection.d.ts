import type { BundledFontFace } from "../model/fonts.ts";
export type StaticFontSelection = {
    kind: "static";
    face: BundledFontFace & {
        postScriptName: string;
        assetHash: string;
    };
    matchedWeight: number;
} | {
    kind: "variable";
} | {
    kind: "unavailable";
    reason: string;
};
/** CSS Fonts §5.2 weight matching, restricted to independently identified static sources. */
export declare function selectStaticFontFace(weight: number, faces: readonly BundledFontFace[] | undefined, style: Record<string, string>): StaticFontSelection;
