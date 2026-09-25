/** Computed font selection with conversion-scoped bundled families. */
import { type BundledFamilies } from "../model/fonts.ts";
import { type FontSpec } from "../model/semantic.ts";
/**
 * Lower-case family name → the SwiftUI system design that carries it: the CSS generic families,
 * the `ui-*` keywords, the Apple system stacks (`-apple-system`, `BlinkMacSystemFont`) and the
 * concrete faces a design names next to a generic (`Menlo`, `Georgia`, …). `cursive`/`fantasy`
 * have no system design and resolve to the default one, which `buildText` reports.
 */
export declare const SYSTEM_DESIGNS: Record<string, "default" | "rounded" | "monospaced" | "serif">;
/**
 * Font of a computed style: family, size, weight, line-height. The computed `font-family` is the
 * authored list, not the family the browser picked, so it is walked in order and the first entry
 * that resolves decides — a family the run bundled becomes `custom` (with `opsz` clamped into
 * the axis range its file declares), a generic or an Apple system stack becomes the matching
 * system design. An unresolvable list falls back to the default design, which `buildText`
 * reports by name.
 */
export declare function fontOf(s: Record<string, string>, families?: BundledFamilies): FontSpec;
