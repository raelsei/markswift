/**
 * Swift source helpers shared by the emitters (views, SVG shapes, harness registry).
 */
import type { Color } from "../model/values.ts";
import type { FontSpec } from "../model/semantic.ts";
import type { ColorCtx } from "./context.ts";

/** `Color.markswift(r, g, b[, a])` argument list; alpha omitted when opaque. */
export function colorArgs(c: Color): string {
  return `${num(c.r)}, ${num(c.g)}, ${num(c.b)}${c.a < 1 ? `, ${num(c.a)}` : ""}`;
}

/**
 * The one place a colour becomes Swift: `Palette.surfaceRaised` when this node's colour is a
 * token of the screen, else the literal `Color.markswift(…)`.
 *
 * `id` is the node painting the colour; the lookup is (screen, theme, node, colour value)
 * because most call sites paint a colour without knowing which named slot of the node it is.
 * Those that do (text runs) pass `slot` (`run2`, `run2.dec`), which still resolves when one
 * light colour is two tokens on the node. Omitting `id` — an SVG inlined through an `<img>`, a
 * control's own value — yields the literal: a colour the extractor never enumerated cannot
 * claim a token.
 *
 * A colour the node's pressed/focused look changes (`ctx.statePaint`, `states.ts`) becomes
 * `(isSavePressed ? state : rest)`, each side resolved the same way.
 */
export function colorExpr(c: Color, ctx: ColorCtx, id?: string, slot?: string): string {
  const paint = id !== undefined ? ctx.statePaint?.get(id) : undefined;
  const pair = paint && ((slot !== undefined ? paint.colors.get(slot) : undefined) ?? paint.colors.get(colorArgs(c)));
  if (pair) return `(${paint.cond} ? ${restingColor(pair.state, ctx, id)} : ${restingColor(pair.rest, ctx, id, slot)})`;
  return restingColor(c, ctx, id, slot);
}

function restingColor(c: Color, ctx: ColorCtx, id?: string, slot?: string): string {
  const token = ctx.tokens?.name(c, id, slot);
  return token ? `Palette.${token}` : `Color.markswift(${colorArgs(c)})`;
}

/** Swift `Double` literal: 3 decimals, always with a fraction so type inference stays `Double`. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const s = (Math.round(v * 1000) / 1000).toString();
  return s.includes(".") || s.includes("e") ? s : s + ".0";
}

/**
 * Swift string literal. Swift accepts only `\0 \\ \t \n \r \" \' \u{…}` escapes and no lone
 * surrogates, so JSON escaping (`\b`, `\f`, `\u000b`, `\ud800`) does not compile. Control
 * characters (C0, DEL, C1) and U+2028/U+2029 become `\u{hex}`; a lone surrogate becomes U+FFFD.
 */
export function str(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c >= 0xd800 && c <= 0xdfff) out += "\uFFFD";
    else if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) out += `\\u{${c.toString(16)}}`;
    else out += ch;
  }
  return out + '"';
}

export function indent(lines: string[], n: number): string[] {
  return lines.map((l) => (l ? "    ".repeat(n) + l : l));
}

/** `HorizontalAlignment` of a start/center/end value (anything else is the leading edge). */
export function horizontalAlignment(a: string | undefined): string {
  return a === "center" ? ".center" : a === "end" ? ".trailing" : ".leading";
}

/** `VerticalAlignment` of a start/center/end value (anything else is the top edge). */
export function verticalAlignment(a: string | undefined): string {
  return a === "center" ? ".center" : a === "end" ? ".bottom" : ".top";
}

/** `Alignment` combining a horizontal and a vertical start/center/end value. */
export function alignment(h: string | undefined, v: string | undefined): string {
  if (v === "center") return horizontalAlignment(h);
  if (h === "center") return verticalAlignment(v);
  return verticalAlignment(v) + (h === "end" ? "Trailing" : "Leading");
}

/** Dash array of a CSS `dashed` (3w on, 2w off) or `dotted` (round dots 2w apart) line. */
export function dashPattern(style: "dashed" | "dotted", width: number): string {
  return style === "dashed" ? `[${num(width * 3)}, ${num(width * 2)}]` : `[0.01, ${num(width * 2)}]`;
}

/** `StrokeStyle` for a CSS line style; styles other than dashed/dotted stroke solid. */
export function strokeStyle(width: number, style: string): string {
  const dash =
    style === "dashed" || style === "dotted"
      ? `${style === "dotted" ? ", lineCap: .round" : ""}, dash: ${dashPattern(style, width)}`
      : "";
  return `StrokeStyle(lineWidth: ${num(width)}${dash})`;
}

/** `EdgeInsets` of CSS-ordered (top, right, bottom, left) insets. */
export function edgeInsets([top, right, bottom, left]: readonly number[]): string {
  return `EdgeInsets(top: ${num(top!)}, leading: ${num(left!)}, bottom: ${num(bottom!)}, trailing: ${num(right!)})`;
}

/** A DOM id or design string as the body of a Swift identifier (may be empty). */
export function identifier(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** `base` the first time, then `base_r2`, `base_r3`, … — counted in `seen`. */
export function uniqueName(base: string, seen: Record<string, number>): string {
  const k = (seen[base] = (seen[base] ?? 0) + 1);
  return k === 1 ? base : `${base}_r${k}`;
}

/** Design words → PascalCase ASCII (`openMenu` → `OpenMenu`, `save-btn` → `SaveBtn`, `Gönder` → `Gonder`); at most 4 words, "" when none survive. */
export function pascalWords(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/** K1 member name: `prefix + PascalCase(words) + suffix` (`fallback` when no word survives); repeats become `…2`, `…3`. Registered in `seen`. */
export function memberName(
  prefix: string,
  words: string,
  seen: Record<string, number>,
  fallback: string,
  suffix = "",
): string {
  const base = prefix + (pascalWords(words) || fallback) + suffix;
  let name = base;
  for (let k = 2; seen[name]; k++) name = `${base}${k}`;
  seen[name] = 1;
  return name;
}

/**
 * Registers a `Shape` struct once under `name`; `body` gives the lines of `path(in:)`.
 * `nonisolated`: Shape's requirements are nonisolated; under a MainActor default-isolation
 * build (SE-0466) an unannotated struct would fail to conform in Swift 6 mode.
 */
export function shapeStruct(name: string, shapes: Record<string, string>, body: () => string[]): string {
  shapes[name] ??=
    [
      `nonisolated struct ${name}: Shape {`,
      "    func path(in rect: CGRect) -> Path {",
      ...indent(body(), 2),
      "    }",
      "}",
    ].join("\n") + "\n";
  return name;
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

/** Default point size of each `Font.TextStyle` at the standard content size — the table `relativeTo:` scales against. */
const TEXT_STYLE_SIZES: Array<[number, string]> = [
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

/** The `Font.TextStyle` whose default size is nearest `size`: what an app-mode font scales with. */
export function nearestTextStyle(size: number): string {
  return TEXT_STYLE_SIZES.reduce((best, [s, name]) =>
    Math.abs(s - size) < Math.abs(best[0] - size) ? [s, name] : best,
  )[1];
}

/**
 * A system font's point size. App mode names an `@ScaledMetric` property (registered in
 * `ctx.scaledFonts`, declared once per view) so the text follows Dynamic Type; fidelity, and
 * `fixed` text placed in absolute coordinates, keep the literal.
 */
export function fontSizeExpr(f: FontSpec, ctx: ColorCtx, fixed = false): string {
  if (ctx.mode !== "app" || fixed || !ctx.scaledFonts || !(f.size > 0)) return num(f.size);
  const size = num(f.size);
  const name = `textSize${size.replace(/\.0$/, "").replace(".", "_")}`;
  ctx.scaledFonts.set(
    name,
    `@ScaledMetric(relativeTo: .${nearestTextStyle(f.size)}) private var ${name}: CGFloat = ${size}`,
  );
  return name;
}

/**
 * Swift `Font` expression for a run's font. A system family is its design plus the nearest
 * named weight in both modes, sized by `fontSizeExpr`; a bundled family differs by mode:
 *
 * - **app** — `.custom(family, size:, relativeTo:)` plus an explicit `.weight(…)`: the shipped
 *   app must scale with Dynamic Type, and the weight is stated rather than inherited because a
 *   variable file's default instance is whatever its `fvar` says (Bricolage Grotesque defaults
 *   to 800, not 400).
 * - **fidelity** — `.markswiftVariable(family, size:, weight:, opsz:)`: the variable axes the browser
 *   actually rendered, so an SSIM against the reference measures the design and not a weight
 *   quantisation. Nothing in this mode is shipped.
 */
export function fontExpr(f: FontSpec, ctx: ColorCtx, fixed = false): string {
  const weightName = WEIGHT_NAMES.reduce((best, [w, name]) =>
    Math.abs(w - f.weight) < Math.abs(best[0] - f.weight) ? [w, name] : best,
  )[1];
  if (f.family.kind === "custom") {
    if (ctx.mode === "fidelity")
      return `.markswiftVariable(${str(f.family.name)}, size: ${num(f.size)}, weight: ${num(f.weight)}${f.opsz !== undefined ? `, opsz: ${num(f.opsz)}` : ""})`;
    return `.custom(${str(f.family.name)}, size: ${num(f.size)}, relativeTo: .${nearestTextStyle(f.size)}).weight(.${weightName})`;
  }
  return `.system(size: ${fontSizeExpr(f, ctx, fixed)}, weight: .${weightName}, design: .${f.family.design})`;
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
