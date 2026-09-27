/**
 * Layout IR — what the browser measured. Target-agnostic, one tree per
 * (screen, theme, state) combination. Produced from CDP DOMSnapshot; consumed
 * by the semantic inference pass. Nothing here knows about SwiftUI.
 */
import { z } from "zod";
import { TextSourceOccurrence, TextSourceCapture } from "./text-source.ts";

export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof Rect>;
/** CSS Typed OM preserves auto/percent/px intent before used values become measured pixels. */
export const PreferredSize = z.object({
  width: z.string(), height: z.string(),
  flexBasis: z.string().optional(),
  inlineSizeDefinite: z.boolean().optional(),
  hasRelativePadding: z.boolean().optional(),
  hasAutoMargins: z.boolean().optional(),
  /** Physical left/right auto intent before CSSOM resolves used margins; absent means unknown. */
  horizontalAutoMargins: z.tuple([z.boolean(), z.boolean()]).optional(),
  /** Cascaded physical relative-position intent, before CSSOM resolves percentages. */
  relativeInsets: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  relativeContainingDirection: z.enum(["ltr", "rtl"]).optional(),
  gridTemplateColumns: z.string().optional(),
  gridTemplateRows: z.string().optional(),
  gridAutoRows: z.string().optional(),
});
export type PreferredSize = z.infer<typeof PreferredSize>;

/** Live default ::marker style and browser font box; absent for custom content/images. */
export const MarkerLayout = z.object({
  symbol: z.enum(["disc", "circle", "square", "disclosure-open", "disclosure-closed"]),
  fontAscent: z.number().positive(), fontDescent: z.number().nonnegative(), fontSize: z.number().positive(),
  /** Fractional capture origin: browser paint snaps in document pixels before root rebasing. */
  pixelOffset: z.object({ x: z.number().min(0).lt(1), y: z.number().min(0).lt(1) }).optional(),
  /** Direct first summary whose state-dependent list-style-type is proved to come from UA rules. */
  disclosureControl: z.boolean().optional(),
});
export type MarkerLayout = z.infer<typeof MarkerLayout>;

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
  flattenedCustomElements?: Array<{ tag: string; id?: string }>;
  /** Optional in legacy captures. Authored/cascaded size intent, independent of measured bounds. */
  preferredSize?: PreferredSize;
  markerLayout?: MarkerLayout;
  /** Parent CSS strut font-box facts, independently measured without changing DOM layout. */
  inlineStrut?: { ascent: number; descent: number; lineHeight: number };
  /** Nonnegative fixed physical widget margins (top/right/bottom/left); absence is unknown. */
  inlineControlMargins?: [number, number, number, number];
  /** Capture-local form/tree identity, resolved before boxless ancestors are flattened. */
  formOwner?: string;
  /** Live selection ordinal; -1 means explicitly unselected, absent means a legacy capture. */
  selectedIndex?: number;
  /** Rendered option label and submitted value before unmeasured descendants are discarded. */
  option?: { label: string; value: string; hidden?: boolean };
  /** Box relative to the capture root, CSS px. */
  bounds: Rect;
  /** Laid-out text for `#text` nodes. */
  text?: string;
  /** Optional raw text/break occurrence before layout pruning; not a verification oracle. */
  textSource?: TextSourceOccurrence;
  /** Capture-root source claims, including empty and unlaid-out occurrences. */
  textSourceCapture?: TextSourceCapture;
  /** Measured first text baseline, in capture-root CSS pixels; absent in legacy captures. */
  firstBaseline?: number;
  /**
   * Measured line boxes of a `#text` node (CDP `DOMSnapshot` `textBoxes`), document-relative,
   * in layout order. `start`/`length` index the raw `text` string, so a box boundary is the
   * browser's line division; `fidelity` emit reproduces it instead of letting CoreText re-wrap.
   * Absent when the snapshot reported no boxes (empty or whitespace-only nodes).
   */
  lines?: Array<{ bounds: Rect; start: number; length: number; baseline?: number }>;
  /** Global paint order index (stacking), when available. */
  paint?: number;
  children: LayoutNode[];
}

export const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    tag: z.string(),
    attrs: z.record(z.string(), z.string()),
    styles: z.record(z.string(), z.string()),
    flattenedCustomElements: z.array(z.object({ tag: z.string(), id: z.string().optional() })).optional(),
    preferredSize: PreferredSize.optional(),
    markerLayout: MarkerLayout.optional(),
    inlineStrut: z.object({ ascent: z.number().positive(), descent: z.number().nonnegative(), lineHeight: z.number().positive() }).optional(),
    inlineControlMargins: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]).optional(),
    formOwner: z.string().optional(),
    selectedIndex: z.number().int().min(-1).optional(),
    option: z.object({ label: z.string(), value: z.string(), hidden: z.boolean().optional() }).optional(),
    bounds: Rect,
    text: z.string().optional(),
    textSource: TextSourceOccurrence.optional(),
    textSourceCapture: TextSourceCapture.optional(),
    firstBaseline: z.number().finite().optional(),
    lines: z.array(z.object({ bounds: Rect, start: z.number(), length: z.number(), baseline: z.number().finite().optional() })).optional(),
    paint: z.number().optional(),
    children: z.array(LayoutNode),
  }),
);

/**
 * One `@font-face` rule the captured page declared, as the browser resolved it. Collected at
 * capture time (`render/browser.ts`): the CSS rules give family, axis ranges and `src`, and
 * `document.fonts` says which of them actually loaded. Target-agnostic — a webfont is an input
 * fact, not a SwiftUI decision; `emit/fonts.ts` turns these into bundled font files.
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
   * `file` is an out-dir-relative path to the bytes, written once per out dir under `_fonts/`
   * and named by content hash. It exists because `url` alone is not a durable reference: a
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
  demoState: z.string().default("normal"),
});
export type Combo = z.infer<typeof Combo>;

export const LayoutDoc = z.object({
  version: z.literal(1),
  source: z.string(),
  combo: Combo,
  /** CSS px size of the capture root (the phone's content area). */
  size: z.object({ w: z.number(), h: z.number() }),
  dpr: z.number(),
  /** Effective background behind the root (computed color string). */
  canvas: z.string().default("rgb(255, 255, 255)"),
  /**
   * `@font-face` rules of the page, deduplicated — the faces the browser resolved, in
   * declaration order. Three states, and they are **not** interchangeable; `undefined` must
   * never be allowed to collapse into `[]`:
   *
   * - **absent** — a capture taken before this field existed. Nobody looked, so nothing may be
   *   concluded: consumers must reproduce their pre-field behaviour. The committed Vacu corpus
   *   is the regression gate and `research/output/vacu-v1` the re-sync corpus, so a stored capture has to
   *   keep producing the output it was measured with. Treating absent as "no webfonts" silently
   *   swapped every custom face in Vacu for a system design once already.
   * - **`[]`** — the capture looked and the document declared no `@font-face`. A named family is
   *   then genuinely unbundled and the substitution is reported.
   * - **non-empty** — decide per face, from the bytes behind its `src`.
   */
  fonts: z.array(FontFace).optional(),
  root: LayoutNode,
});
export type LayoutDoc = z.infer<typeof LayoutDoc>;

/** Computed-style whitelist requested from DOMSnapshot. Keep sorted; order is the styles[] index. */
export const STYLE_WHITELIST = [
  "appearance",
  "align-content",
  "align-items",
  "align-self",
  "animation-duration",
  "animation-name",
  "aspect-ratio",
  "backdrop-filter",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
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
  "caption-side",
  "clear",
  "clip-path",
  "color",
  "color-scheme",
  "column-gap",
  "content",
  "direction",
  "display",
  "fill",
  "fill-opacity",
  "filter",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "float",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-optical-sizing",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-synthesis",
  "font-variant-alternates",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-ligatures",
  "font-variant-numeric",
  "font-variant-position",
  "font-variation-settings",
  "font-weight",
  "grid-auto-flow",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "justify-items",
  "justify-self",
  "left",
  "letter-spacing",
  "line-height",
  "list-style-image",
  "list-style-position",
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
  "image-rendering",
  "opacity",
  "order",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "row-gap",
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
  "text-indent",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "text-wrap-mode",
  "top",
  "transform",
  "transform-origin",
  "transition-duration",
  "transition-property",
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
  "writing-mode",
] as const;
