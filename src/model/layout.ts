/**
 * Layout IR — what the browser measured. Target-agnostic, one tree per
 * (screen, theme) combination. Produced from CDP DOMSnapshot; consumed
 * by the semantic inference pass. Nothing here knows about SwiftUI.
 */
import { z } from "zod";

export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof Rect>;
/** CSS Typed OM preserves auto/percent/px intent before used values become measured pixels. */
export const PreferredSize = z.object({
  width: z.string(),
  height: z.string(),
  /** Typed-OM computed insets of a positioned box (`absolute`, `fixed`, `relative`, `sticky`): `auto` and `%` survive here (DOMSnapshot reports used px, and a relative `%` top against an auto-height containing block as a non-zero px it never applies). */
  insets: z.object({ top: z.string(), right: z.string(), bottom: z.string(), left: z.string() }).optional(),
  /** Sides whose computed margin is `auto` (Typed OM; DOMSnapshot reports the used px). Absent when none. */
  autoMargins: z.array(z.enum(["top", "right", "bottom", "left"])).optional(),
  /** Typed-OM computed `grid-template-columns` as authored (`repeat(auto-fit, minmax(100px, 1fr))`, `1fr 2fr`); absent when `none`. */
  gridTemplateColumns: z.string().optional(),
  /** Authored `grid-template-rows` (Typed OM), only when not `none`; absent = implicit rows. */
  gridTemplateRows: z.string().optional(),
});
export type PreferredSize = z.infer<typeof PreferredSize>;

/**
 * One laid-out DOM node. `display: contents` elements are not here — their
 * children are spliced into the parent's `children` (the wrapper's attrs/id
 * are lost). `visibility: hidden` nodes are present with their box.
 */
export interface LayoutNode {
  /** Stable node identity (`#id`, `data-markswift`, other identity attributes, or element-index path); absent for text nodes. */
  id?: string;
  /**
   * Lower-case tag name, `#text`, or a pseudo-element: `::before` / `::after` /
   * `::marker` (generated content materialised by the snapshot: styles, border
   * box, and one `#text` child with the browser-resolved text — counters,
   * quotes, list markers). `::before`/`::after`/`::marker` also get one `img` child per image the browser laid
   * out from `content: url()` / `list-style-image` (`attrs.src`, its box). `::after` follows the element's real
   * children.
   */
  tag: string;
  /** Raw attributes. */
  attrs: Record<string, string>;
  /**
   * `<img>` only: the source the browser loaded when it chose a `srcset`/`<picture>` candidate
   * other than `src` (spelled as authored), or the inlined data URL. Consumers read
   * `currentSrc ?? attrs["src"]`.
   */
  currentSrc?: string;
  /** Whitelisted computed styles, resolved by the browser (cascade, vars, color-mix). */
  styles: Record<string, string>;
  /** Authored/cascaded size intent, independent of measured bounds; absent for text and pseudo-element nodes. */
  preferredSize?: PreferredSize;
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
  lines?: Array<{ bounds: Rect; start: number; length: number }>;
  /** Global paint order index (stacking), when available. */
  paint?: number;
  /** Paint the element shows in an interaction state: computed values of whitelisted paint properties that differ from rest (`:hover`+`:active` = pressed, `:focus`+`:focus-visible` = focused), captured by forcing the state over CDP. */
  states?: { pressed?: Record<string, string>; focused?: Record<string, string> };
  /** Indices into `LayoutDoc.conditions` whose inner rules match this element (stamped at capture). Absent when none. */
  conditional?: number[];
  /** Pseudo-element styles DOMSnapshot does not report, read with getComputedStyle(el, "::<name>"). `placeholder`: inputs and textareas with a `placeholder` attribute (color, -webkit-text-fill-color, opacity, font-style, font-weight). */
  pseudoStyles?: { placeholder?: Record<string, string> };
  children: LayoutNode[];
}

export const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    tag: z.string(),
    attrs: z.record(z.string(), z.string()),
    currentSrc: z.string().optional(),
    styles: z.record(z.string(), z.string()),
    preferredSize: PreferredSize.optional(),
    bounds: Rect,
    text: z.string().optional(),
    lines: z.array(z.object({ bounds: Rect, start: z.number(), length: z.number() })).optional(),
    paint: z.number().optional(),
    states: z
      .object({
        pressed: z.record(z.string(), z.string()).optional(),
        focused: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    conditional: z.array(z.number().int().nonnegative()).optional(),
    pseudoStyles: z.object({ placeholder: z.record(z.string(), z.string()).optional() }).optional(),
    children: z.array(LayoutNode),
  }),
);

/**
 * One `@font-face` rule the captured page declared, as the browser resolved it. Collected at
 * capture time (`browser/fonts.ts`): the CSS rules give family, axis ranges and `src`, and
 * `document.fonts` says which of them actually loaded. Target-agnostic — a webfont is an input
 * fact, not a SwiftUI decision; `fonts/package.ts` turns these into bundled font files.
 */
export const FontFace = z.object({
  /** Family name as authored, unquoted — the name `font-family` declarations refer to. */
  family: z.string(),
  /** Resolved `font-weight` range; a single weight is `[w, w]`, a variable range `[100, 900]`. */
  weight: z.tuple([z.number(), z.number()]),
  style: z.enum(["normal", "italic", "oblique"]),
  /** `unicode-range`, verbatim, when the face declares one — a subsetted face covers only part of the text. */
  unicodeRange: z.string().optional(),
  /**
   * `src` entries in declaration order, URLs resolved against the stylesheet — reduced to the
   * path when the source came from the source's own (ephemeral-port) server, so a capture is
   * byte-identical across renders. `local()` entries are dropped: a face that only names an
   * installed font has nothing to bundle.
   *
   * `file` keys the face's bytes in the capture's `fontFiles` (content-hash name under the
   * `_fonts/` prefix). It exists because `url` alone is not a durable reference: a
   * design whose fonts are local files is served from an ephemeral port, so the URL is dead the
   * moment the capture outlives the run. Absent for a `data:` URL (the URL *is* the bytes) and
   * for a remote face that could not be read at capture time.
   */
  src: z.array(z.object({ url: z.string(), format: z.string().optional(), file: z.string().optional() })),
  /** `document.fonts` reported this face as loaded, i.e. the reference pixels are its glyphs. */
  loaded: z.boolean(),
});
export type FontFace = z.infer<typeof FontFace>;

export const Combo = z.object({
  screen: z.string(),
  theme: z.enum(["light", "dark"]),
});
export type Combo = z.infer<typeof Combo>;
export type Theme = Combo["theme"];

/** Version of the saved-capture format. Bump it with any STYLE_WHITELIST or schema change, or a change in what a
 * captured value means — once per release cycle: while the version is unreleased (see
 * tests/architecture/layout-doc.test.ts, which pins the schema to it) later changes re-pin its fingerprint. */
export const LAYOUT_DOC_VERSION = 4;

/** Capture marks elements an author rule styles through :valid/:invalid (or :user-*); analysis reports them. */
export const VALIDATION_MARK = "data-markswift-validation";
/** Capture stamps the indices (space-separated) of the `conditions` whose inner rules match an element; moved to `conditional`. */
export const CONDITIONAL_MARK = "data-markswift-conditional";
/** Capture stamps a serial on the query container of a `@container` condition; resolved to its node id. */
export const CONTAINER_MARK = "data-markswift-container";

/** A size `@media`/`@container` condition whose rules hit captured elements; `matches` at this capture's viewport;
 * `container` is the query container's node id. Order is capture-local (`LayoutNode.conditional` indexes it). */
export const LayoutCondition = z.object({
  kind: z.enum(["media", "container"]),
  query: z.string(),
  matches: z.boolean(),
  container: z.string().optional(),
});
export type LayoutCondition = z.infer<typeof LayoutCondition>;

export const LayoutDoc = z.object({
  version: z.literal(LAYOUT_DOC_VERSION),
  source: z.string(),
  combo: Combo,
  /** CSS px size of the capture root (the phone's content area). */
  size: z.object({ w: z.number(), h: z.number() }),
  /** The browser viewport in capture-root coordinates (the root's top-left is 0,0): what `100vh` and `position: fixed` resolved against. */
  viewport: Rect,
  conditions: z.array(LayoutCondition).default([]),
  dpr: z.number(),
  /** Effective background behind the root (computed color string). */
  canvas: z.string().default("rgb(255, 255, 255)"),
  /** `@font-face` rules of the page, deduplicated — the faces the browser resolved, in declaration order. */
  fonts: z.array(FontFace),
  root: LayoutNode,
});
export type LayoutDoc = z.infer<typeof LayoutDoc>;

/** Computed-style whitelist requested from DOMSnapshot. Keep sorted; order is the styles[] index. */
export const STYLE_WHITELIST = [
  "accent-color",
  "align-content",
  "align-items",
  "align-self",
  "animation-name",
  "appearance",
  "aspect-ratio",
  "backdrop-filter",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "bottom",
  "box-shadow",
  "box-sizing",
  "clear",
  "clip-path",
  "color",
  "color-scheme",
  "column-gap",
  "container-name",
  "container-type",
  "content",
  "direction",
  "display",
  "empty-cells",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "float",
  "font-family",
  "font-feature-settings",
  "font-optical-sizing",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant-caps",
  "font-variant-numeric",
  "font-variation-settings",
  "font-weight",
  "grid-auto-columns",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-column-end",
  "grid-column-start",
  "grid-row-end",
  "grid-row-start",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "hyphens",
  "justify-content",
  "justify-items",
  "justify-self",
  "left",
  "letter-spacing",
  "line-height",
  "list-style-image",
  "list-style-type",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "mask-image",
  "mask-position",
  "mask-repeat",
  "mask-size",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "mix-blend-mode",
  "object-fit",
  "object-position",
  "opacity",
  "order",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "overlay",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "pointer-events",
  "position",
  "right",
  "rotate",
  "row-gap",
  "scale",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "table-layout",
  "text-align",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-indent",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "text-underline-offset",
  "text-wrap-mode",
  "text-wrap-style",
  "top",
  "transform",
  "transform-origin",
  "translate",
  "unicode-bidi",
  "vertical-align",
  "visibility",
  "-webkit-line-clamp",
  "-webkit-text-decorations-in-effect",
  "-webkit-text-fill-color",
  "white-space",
  "white-space-collapse",
  "width",
  "word-break",
  "word-spacing",
  "writing-mode",
] as const;
