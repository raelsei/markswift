/**
 * Every CSS `<blend-mode>` keyword (`mix-blend-mode`, `background-blend-mode`). Each one is a
 * separable or non-separable blend function the CSS compositing spec takes verbatim from the
 * PDF blend model, which is also what CoreGraphics — and therefore SwiftUI's `BlendMode` —
 * implements, so the set maps one to one onto the platform.
 */
declare const BLEND_MODES: {
    readonly normal: true;
    readonly multiply: true;
    readonly screen: true;
    readonly overlay: true;
    readonly darken: true;
    readonly lighten: true;
    readonly "color-dodge": true;
    readonly "color-burn": true;
    readonly "hard-light": true;
    readonly "soft-light": true;
    readonly difference: true;
    readonly exclusion: true;
    readonly hue: true;
    readonly saturation: true;
    readonly color: true;
    readonly luminosity: true;
    readonly "plus-lighter": true;
    readonly "plus-darker": true;
};
export type BlendMode = keyof typeof BLEND_MODES;
/** One `<blend-mode>` keyword; `undefined` for anything outside the spec's list. */
export declare function parseBlendMode(s: string | undefined): BlendMode | undefined;
/**
 * `background-blend-mode`: one keyword per background layer, in CSS layer order (top-most
 * first), cycled by the caller when there are more layers than keywords. An unrecognised
 * keyword yields `normal` so a layer is never silently dropped.
 */
export declare function parseBlendModes(s: string | undefined): BlendMode[];
export {};
