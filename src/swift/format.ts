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
export class Writer {
  private lines: string[] = [];
  private depth = 0;
  line(s = ""): void {
    this.lines.push(s ? "    ".repeat(this.depth) + s : "");
  }
  block(open: string, body: () => void, close = "}"): void {
    this.line(open);
    this.depth++;
    body();
    this.depth--;
    this.line(close);
  }
  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}

/** `Color.markswift(r, g, b[, a])` argument list; alpha omitted when opaque. */
export function colorArgs(c: Color): string {
  return `${num(c.r)}, ${num(c.g)}, ${num(c.b)}${c.a < 1 ? `, ${num(c.a)}` : ""}`;
}

/**
 * The one place a colour becomes Swift: `Color.surfaceRaised` when this node's colour is a
 * token of the screen, else the literal `Color.markswift(…)`.
 *
 * `id` is the node painting the colour; the lookup is (screen, theme, node, colour value)
 * because the call sites paint a colour without knowing which named slot of the node it is.
 * Omitting `id` — an SVG inlined through an `<img>`, a control's own value — yields the
 * literal: a colour the extractor never enumerated cannot claim a token.
 */
export function colorExpr(c: Color, ctx: ColorCtx, id?: string): string {
  const token = ctx.tokens?.name(c, id);
  return token ? `Color.${token}` : `Color.markswift(${colorArgs(c)})`;
}

/** Swift `Double` literal: 3 decimals, always with a fraction so type inference stays `Double`. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const s = (Math.round(v * 1000) / 1000).toString();
  return s.includes(".") || s.includes("e") ? s : s + ".0";
}

/** Font axis coordinates retain source precision, including exact fvar 16.16 defaults. */
function axisCoordinate(v: number): string {
  if (!Number.isFinite(v)) return num(v);
  const s = String(v);
  return s.includes(".") || s.includes("e") ? s : s + ".0";
}

export function indent(lines: string[], n: number): string[] {
  return lines.map((l) => (l ? "    ".repeat(n) + l : l));
}

const WEIGHT_NAMES: Array<[number, string]> = [
  [100, "ultraLight"],
  [200, "thin"],
  [300, "light"],
  [400, "regular"],
  [500, "medium"],
  [600, "semibold"],
  [700, "bold"],
  [800, "heavy"],
  [900, "black"],
];

/**
 * Default point size of each `Font.TextStyle` at the standard content size — the table
 * `relativeTo:` scales against. Exported because leading has the same problem: a value derived
 * from a font size only tracks Dynamic Type if it is anchored to the same style.
 */
export const TEXT_STYLE_SIZES: Array<[number, string]> = [
  [34, "largeTitle"],
  [28, "title"],
  [22, "title2"],
  [20, "title3"],
  [17, "body"],
  [16, "callout"],
  [15, "subheadline"],
  [13, "footnote"],
  [12, "caption"],
  [11, "caption2"],
];

/**
 * Swift `Font` expression for a run's font. A system family is its design plus the nearest
 * named weight in both modes; a bundled family differs by mode, which is the decision in
 * HANDOFF §10.15:
 *
 * - **app** — `.custom(family, size:, relativeTo:)` plus an explicit `.weight(…)`: the shipped
 *   app must scale with Dynamic Type, and the weight is stated rather than inherited because a
 *   variable file's default instance is whatever its `fvar` says (Bricolage Grotesque defaults
 *   to 800, not 400).
 * - **fidelity** — exact variable coordinates, or an admitted static public source face. This
 *   identifies the requested font route; it does not prove native/browser glyph paint equality.
 */
export function fontExpr(f: FontSpec, ctx: ColorCtx): string {
  const weightName = WEIGHT_NAMES.reduce((best, [w, name]) => (Math.abs(w - f.weight) < Math.abs(best[0] - f.weight) ? [w, name] : best))[1];
  if (f.family.kind === "custom") {
    if (ctx.mode === "fidelity") return `.markswiftVariable(${str(f.family.name)}, size: ${num(f.size)}, weight: ${num(f.weight)}${f.opsz !== undefined ? `, opsz: ${axisCoordinate(f.opsz)}` : ""}${f.staticFace ? `, staticFace: ${str(f.staticFace.postScriptName)}` : ""})`;
    const style = TEXT_STYLE_SIZES.reduce((best, [s, name]) => (Math.abs(s - f.size) < Math.abs(best[0] - f.size) ? [s, name] : best))[1];
    return `.custom(${str(f.family.name)}, size: ${num(f.size)}, relativeTo: .${style}).weight(.${weightName})`;
  }
  return `.system(size: ${num(f.size)}, weight: .${weightName}, design: .${f.family.design})`;
}

/** FNV-1a 32-bit, hex — stable names for generated shapes. */
export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
