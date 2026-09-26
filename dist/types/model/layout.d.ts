/**
 * Layout IR — what the browser measured. Target-agnostic, one tree per
 * (screen, theme, state) combination. Produced from CDP DOMSnapshot; consumed
 * by the semantic inference pass. Nothing here knows about SwiftUI.
 */
import { z } from "zod";
export declare const Rect: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>;
export type Rect = z.infer<typeof Rect>;
/** CSS Typed OM preserves auto/percent/px intent before used values become measured pixels. */
export declare const PreferredSize: z.ZodObject<{
    width: z.ZodString;
    height: z.ZodString;
}, z.core.$strip>;
export type PreferredSize = z.infer<typeof PreferredSize>;
/**
 * One laid-out DOM node. `display: contents` elements are not here — their
 * children are spliced into the parent's `children` (the wrapper's attrs/id
 * are lost). `visibility: hidden` nodes are present with their box.
 */
export interface LayoutNode {
    /** Stable node identity (`#id`, `data-markswift`, legacy `data-h2s`, other identity attributes, or element-index path); absent for text nodes. */
    id?: string;
    /**
     * Lower-case tag name, `#text`, or a pseudo-element: `::before` / `::after` /
     * `::marker` (generated content materialised by the snapshot: styles, border
     * box, and one `#text` child with the browser-resolved text — counters,
     * quotes, list markers). `::after` follows the element's real children.
     */
    tag: string;
    /**
     * Raw attributes. `<img>` additionally carries `data-h2s-src` when the browser
     * loaded a `srcset`/`<picture>` candidate other than `src`, spelled as
     * authored; consumers read `attrs["data-h2s-src"] ?? attrs["src"]`.
     */
    attrs: Record<string, string>;
    /** Whitelisted computed styles, resolved by the browser (cascade, vars, color-mix). */
    styles: Record<string, string>;
    /** Boxless custom ancestors flattened by `display: contents`; their semantics need a diagnostic. */
    flattenedCustomElements?: Array<{
        tag: string;
        id?: string;
    }>;
    /** Optional in legacy captures. Authored/cascaded size intent, independent of measured bounds. */
    preferredSize?: PreferredSize;
    /** Capture-local form/tree identity, resolved before boxless ancestors are flattened. */
    formOwner?: string;
    /** Live selection ordinal; -1 means explicitly unselected, absent means a legacy capture. */
    selectedIndex?: number;
    /** Rendered option label and submitted value before unmeasured descendants are discarded. */
    option?: {
        label: string;
        value: string;
        hidden?: boolean;
    };
    /** Box relative to the capture root, CSS px. */
    bounds: Rect;
    /** Laid-out text for `#text` nodes. */
    text?: string;
    /**
     * Measured line boxes of a `#text` node (CDP `DOMSnapshot` `textBoxes`), document-relative,
     * in layout order. `start`/`length` index the raw `text` string, so a box boundary is the
     * browser's line division; `fidelity` emit reproduces it instead of letting CoreText re-wrap.
     * Absent when the snapshot reported no boxes (empty or whitespace-only nodes).
     */
    lines?: Array<{
        bounds: Rect;
        start: number;
        length: number;
    }>;
    /** Global paint order index (stacking), when available. */
    paint?: number;
    children: LayoutNode[];
}
export declare const LayoutNode: z.ZodType<LayoutNode>;
/**
 * One `@font-face` rule the captured page declared, as the browser resolved it. Collected at
 * capture time (`render/browser.ts`): the CSS rules give family, axis ranges and `src`, and
 * `document.fonts` says which of them actually loaded. Target-agnostic — a webfont is an input
 * fact, not a SwiftUI decision; `emit/fonts.ts` turns these into bundled font files.
 */
export declare const FontFace: z.ZodObject<{
    family: z.ZodString;
    weight: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    style: z.ZodEnum<{
        normal: "normal";
        italic: "italic";
        oblique: "oblique";
    }>;
    unicodeRange: z.ZodOptional<z.ZodString>;
    src: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        format: z.ZodOptional<z.ZodString>;
        file: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    loaded: z.ZodBoolean;
}, z.core.$strip>;
export type FontFace = z.infer<typeof FontFace>;
export declare const Combo: z.ZodObject<{
    screen: z.ZodString;
    theme: z.ZodEnum<{
        dark: "dark";
        light: "light";
    }>;
    demoState: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type Combo = z.infer<typeof Combo>;
export declare const LayoutDoc: z.ZodObject<{
    version: z.ZodLiteral<1>;
    source: z.ZodString;
    combo: z.ZodObject<{
        screen: z.ZodString;
        theme: z.ZodEnum<{
            dark: "dark";
            light: "light";
        }>;
        demoState: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    size: z.ZodObject<{
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>;
    dpr: z.ZodNumber;
    canvas: z.ZodDefault<z.ZodString>;
    fonts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        family: z.ZodString;
        weight: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        style: z.ZodEnum<{
            normal: "normal";
            italic: "italic";
            oblique: "oblique";
        }>;
        unicodeRange: z.ZodOptional<z.ZodString>;
        src: z.ZodArray<z.ZodObject<{
            url: z.ZodString;
            format: z.ZodOptional<z.ZodString>;
            file: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        loaded: z.ZodBoolean;
    }, z.core.$strip>>>;
    root: z.ZodType<LayoutNode, unknown, z.core.$ZodTypeInternals<LayoutNode, unknown>>;
}, z.core.$strip>;
export type LayoutDoc = z.infer<typeof LayoutDoc>;
/** Computed-style whitelist requested from DOMSnapshot. Keep sorted; order is the styles[] index. */
export declare const STYLE_WHITELIST: readonly ["align-content", "align-items", "align-self", "animation-duration", "animation-name", "aspect-ratio", "backdrop-filter", "background-blend-mode", "background-clip", "background-color", "background-image", "background-position", "background-repeat", "background-size", "border-bottom-color", "border-bottom-left-radius", "border-bottom-right-radius", "border-bottom-style", "border-bottom-width", "border-left-color", "border-left-style", "border-left-width", "border-right-color", "border-right-style", "border-right-width", "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-top-style", "border-top-width", "bottom", "box-shadow", "box-sizing", "clear", "clip-path", "color", "column-gap", "content", "direction", "display", "fill", "fill-opacity", "filter", "flex-basis", "flex-direction", "flex-grow", "flex-shrink", "flex-wrap", "float", "font-family", "font-size", "font-style", "font-variant-numeric", "font-weight", "grid-auto-flow", "grid-template-columns", "grid-template-rows", "height", "justify-content", "left", "letter-spacing", "line-height", "margin-bottom", "margin-left", "margin-right", "margin-top", "mask-image", "mask-position", "mask-repeat", "mask-size", "max-height", "max-width", "min-height", "min-width", "mix-blend-mode", "object-fit", "object-position", "opacity", "order", "outline-color", "outline-offset", "outline-style", "outline-width", "overflow-wrap", "overflow-x", "overflow-y", "padding-bottom", "padding-left", "padding-right", "padding-top", "position", "right", "row-gap", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "stroke-width", "tab-size", "table-layout", "text-align", "text-decoration-color", "text-decoration-line", "text-decoration-style", "text-indent", "text-overflow", "text-shadow", "text-transform", "text-wrap-mode", "top", "transform", "transform-origin", "transition-duration", "transition-property", "vertical-align", "visibility", "-webkit-line-clamp", "-webkit-text-decorations-in-effect", "-webkit-text-fill-color", "white-space", "white-space-collapse", "width", "word-break", "writing-mode"];
