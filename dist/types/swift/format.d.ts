/**
 * Swift source helpers shared by the emitters (views, SVG shapes, harness registry).
 */
import type { Color } from "../css/index.ts";
import type { FontSpec } from "../model/semantic.ts";
import type { ColorCtx } from "./context.ts";
import { swiftStringLiteral as str } from "./string-literal.ts";
export type { ColorCtx, ScreenTokens } from "./context.ts";
export { str };
/** Indentation-aware line buffer. */
export declare class Writer {
    private lines;
    private depth;
    line(s?: string): void;
    block(open: string, body: () => void, close?: string): void;
    toString(): string;
}
/** `Color.markswift(r, g, b[, a])` argument list; alpha omitted when opaque. */
export declare function colorArgs(c: Color): string;
/**
 * The one place a colour becomes Swift: `Color.surfaceRaised` when this node's colour is a
 * token of the screen, else the literal `Color.markswift(…)`.
 *
 * `id` is the node painting the colour; the lookup is (screen, theme, node, colour value)
 * because the call sites paint a colour without knowing which named slot of the node it is.
 * Omitting `id` — an SVG inlined through an `<img>`, a control's own value — yields the
 * literal: a colour the extractor never enumerated cannot claim a token.
 */
export declare function colorExpr(c: Color, ctx: ColorCtx, id?: string): string;
/** Swift `Double` literal: 3 decimals, always with a fraction so type inference stays `Double`. */
export declare function num(v: number): string;
export declare function indent(lines: string[], n: number): string[];
/**
 * Default point size of each `Font.TextStyle` at the standard content size — the table
 * `relativeTo:` scales against. Exported because leading has the same problem: a value derived
 * from a font size only tracks Dynamic Type if it is anchored to the same style.
 */
export declare const TEXT_STYLE_SIZES: Array<[number, string]>;
/**
 * Swift `Font` expression for a run's font. A system family is its design plus the nearest
 * named weight in both modes; a bundled family differs by mode, which is the decision in
 * HANDOFF §10.15:
 *
 * - **app** — `.custom(family, size:, relativeTo:)` plus an explicit `.weight(…)`: the shipped
 *   app must scale with Dynamic Type, and the weight is stated rather than inherited because a
 *   variable file's default instance is whatever its `fvar` says (Bricolage Grotesque defaults
 *   to 800, not 400).
 * - **fidelity** — `.markswiftVariable(family, size:, weight:, opsz:)`: the variable axes the browser
 *   actually rendered, so an SSIM against the reference measures the design and not a weight
 *   quantisation. Nothing in this mode is shipped.
 */
export declare function fontExpr(f: FontSpec, ctx: ColorCtx): string;
/** FNV-1a 32-bit, hex — stable names for generated shapes. */
export declare function hash(s: string): string;
