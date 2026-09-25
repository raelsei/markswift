/** Inline gaps, fragments, line breaks and baseline placement. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun } from "../model/semantic.ts";
import { type BundledFamilies } from "../model/fonts.ts";
import { type MeasuredTextRun } from "./context.ts";
/**
 * The horizontal padding and border of an inline element is advance the browser inserted around
 * its text, but a native run carries no box — so it becomes a run that paints nothing and only
 * advances the line. Nested inline elements contribute one gap each, at the point where their
 * first (or last) run sits, so `<a><code>x</code></a>` opens both boxes before the same glyph.
 */
export declare function withInlineGaps(built: MeasuredTextRun[], host: LayoutNode): TextRun[];
/**
 * The collapsed space between two inline elements, as a run of the host's own text: its style,
 * and a text node of its own so the browser's measured line boxes — which belong to the real
 * text nodes — are not read twice.
 */
export declare function hostSpace(host: LayoutNode, families: BundledFamilies): MeasuredTextRun;
/** The inline elements from `host` (exclusive) down to `el` (inclusive), outermost first. */
export declare function inlineChain(host: LayoutNode, el: LayoutNode): LayoutNode[];
/**
 * The boxes a wrapped inline element was painted in: one per line it spans. The measured text
 * fragments inside it are the content areas, so each line's box is their union grown by the
 * element's padding and border — vertically on every line, horizontally only where the box
 * actually opens and closes (`box-decoration-break: slice`, the CSS default).
 */
export declare function inlineFragments(el: LayoutNode): Rect[];
/** Drops the whitespace `edge` matches from a run, keeping its source map aligned. */
export declare function trimRun(b: MeasuredTextRun, edge: RegExp): void;
/**
 * The browser's line division, re-expressed as offsets into each run's laid-out text.
 *
 * A measured box is an inline *fragment*, not a line: Blink splits one at every collapsed
 * whitespace run that came from a source newline, so several boxes routinely share a line.
 * Fragments are grouped by their top edge; the first fragment of each line after the first is
 * a break, and the first output character at or after its raw index is where it goes.
 */
export declare function markLineBreaks(built: MeasuredTextRun[], note: (s: string) => void): void;
/**
 * `vertical-align` on an inline run (`<sub>`, `<sup>`, `vertical-align: super`) as a baseline
 * offset in px. The shift is measured against the nearest run on the same line that sits on the
 * host's own baseline, so a UA-defined keyword needs no table.
 */
export declare function markBaselineShifts(built: MeasuredTextRun[], host: LayoutNode, note: (s: string) => void): void;
