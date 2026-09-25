/** Inline run collection, whitespace normalization and text decoration. */
import { type LayoutNode } from "../model/layout.ts";
import { type Color } from "../css/index.ts";
import { type TextDecoration } from "../model/semantic.ts";
import { type SourceTextRun } from "./context.ts";
/** Inline (non-atomic) element whose subtree is nothing but text: merged into the parent's runs. */
export declare function isInlineText(c: LayoutNode): boolean;
export declare function collectRuns(el: LayoutNode, runs: SourceTextRun[]): void;
/** Split runs into groups separated by flow children (by document order → measured y/x proximity). */
export declare function groupRuns(host: LayoutNode, runs: SourceTextRun[]): SourceTextRun[][];
export declare function contains(a: LayoutNode, b: LayoutNode): boolean;
export type Collapse = "collapse" | "preserve" | "preserve-breaks";
/** `white-space-collapse` (Chrome longhand), or the `white-space` shorthand for older snapshots. */
export declare function collapseOf(s: Record<string, string>): Collapse;
/** `text-wrap-mode: nowrap` (Chrome longhand), or the `white-space` shorthand for older snapshots. */
export declare function noWrap(s: Record<string, string>): boolean;
/**
 * Whitespace as the browser laid it out — collapsed to single spaces, or kept (breaks only, or
 * all) — plus a source map: `src[i]` is the index in `text` of the character that produced
 * output character `i`, a collapsed run mapping to its first character. The map is what lets
 * the browser's measured line division, which indexes the raw text, be re-expressed as offsets
 * into the laid-out run text.
 */
export declare function normalizeWhitespace(text: string, mode: Collapse): {
    text: string;
    src: number[];
};
export declare function decorationOf(s: Record<string, string>, color: Color): TextDecoration | undefined;
