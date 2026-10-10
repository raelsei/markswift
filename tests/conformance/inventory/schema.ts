/**
 * Feature classification schema: what Markswift maps, approximates, refuses,
 * or ignores, one row per HTML element, SVG element, Chrome computed-style
 * property and notable attribute. Fixtures name their rows in
 * `<meta name="markswift-rows">`.
 *
 * A row is a *decision*, not a measurement: `class` says what the product
 * promises for the feature, `impl` says whether today's pipeline delivers it.
 */

/**
 * Product decision for a feature.
 * - `mapped`: faithful native equivalent; IR field + emitter output.
 * - `approximated`: rendered, but visibly different or lossy; the note says how.
 * - `unmapped`: no native equivalent; reported to the user, never silently dropped
 *   (an input constraint, not a bug).
 * - `non-visual`: affects nothing the pipeline renders (metadata, scripting,
 *   interaction-only, print, alias of another row); ignored on purpose.
 */
export type Class = "mapped" | "approximated" | "unmapped" | "non-visual";

/** Whether the current pipeline (`src/`) already delivers the decided class. */
export type Impl = "yes" | "partial" | "no";

/**
 * How the feature reaches the IR.
 * - `structure`: element/tree shape (tag, children).
 * - `attribute`: HTML/SVG attribute value.
 * - `style`: computed-style value read from the browser (needs a `STYLE_WHITELIST` entry).
 * - `geometry`: the browser resolves it into measured boxes; the IR only reads frames.
 * - `none`: nothing to read.
 */
export type Via = "structure" | "attribute" | "style" | "geometry" | "none";

export type Domain = "html" | "attribute" | "css-layout" | "css-typography" | "css-paint" | "css-misc" | "svg";

export interface Entry {
  /**
   * Canonical id. HTML element: `img`; CSS property: `background-clip`;
   * value-specific row: `display: grid` (a base row for the property must exist);
   * HTML attribute: `@srcset` (element-scoped: `img@srcset`); event handler: `@onclick`;
   * SVG element: `svg:path`; SVG presentation attribute: `svg@stroke-width`.
   */
  id: string;
  /** Report grouping within the domain, e.g. "Sectioning", "Flex", "Gradients". */
  group: string;
  class: Class;
  /** SwiftUI construct or modifier the row maps to; `—` when none. */
  target: string;
  /** IR node or field carrying it (`StackNode`, `Style.fills`, `TextRun.uppercase`); `—` when none. */
  ir: string;
  via: Via;
  impl: Impl;
  /** Rationale for `approximated`/`unmapped`, edge cases, deferred work. Required for those two classes. */
  note?: string;
  /**
   * Why SSIM against the browser reference is not a valid gate for this row — set ONLY where the
   * reference itself is the wrong target, e.g. a font keyword whose platform meaning we honour and
   * Chrome resolves to its own user preference. Such a row is reported with its measurement and
   * this reason instead of a pass/fail, because no emitter change could ever move it.
   */
  unmeasurable?: string;
  /** Spec or MDN URL. */
  spec?: string;
}

export interface Inventory {
  domain: Domain;
  entries: Entry[];
}
