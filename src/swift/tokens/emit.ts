import type { ColorToken, PaletteMap, TokenSet } from "./types.ts";
import { colorArgs } from "../format.ts";
import { GENERATED_BY } from "../../model/version.ts";
import type { Color } from "../../model/values.ts";
import type { ConversionWarning } from "../../model/semantic.ts";

const STATIC_HEADER = `// ${GENERATED_BY} — colour tokens extracted from one captured theme.
//
// The generated view references these names instead of repeated Color.markswift(…) literals.
// Each token is exactly the literal it replaced; none adapts to the colour scheme.`;

const ADAPTIVE_HEADER = `// ${GENERATED_BY} — colour tokens paired from the light and dark captures of one page.
//
// The generated view references these names instead of inline Color.markswift(…) literals.
// An adaptive token is Color.markswift(light:dark:) and follows the colour scheme; a static token
// is the same colour in both themes.`;

/**
 * `<View>+Tokens.swift`: one `static let` per token in `extension <View> { enum Palette }`, so
 * two views never collide and a token can never shadow SwiftUI's `Color.primary`. Static tokens
 * emit a single colour; semantic tokens emit the pair via the runtime's
 * `Color.markswift(light:dark:)`. `adaptive` says whether the set was paired from a light and a
 * dark capture, which the header states. Without `owner` the palette is module-level: one
 * `Palette` shared by every view of a generated library (`markswift build`). A `palette` map
 * replaces a matched token's value with the app's own Swift colour expression, verbatim.
 */
export function emitDesignTokens(
  set: TokenSet,
  owner: string | undefined,
  options: { adaptive?: boolean; visibility?: "internal" | "public"; palette?: PaletteMap } = {},
): string {
  const adaptive = options.adaptive ?? false;
  const access = options.visibility === "public" ? "public " : "";
  const palette = options.palette;
  const pad = owner === undefined ? "    " : "        ";
  const semantic = set.tokens.filter((t) => t.kind === "semantic");
  const slots = set.tokens.reduce((n, t) => n + t.slots, 0);
  const header = adaptive ? ADAPTIVE_HEADER : STATIC_HEADER;
  const out: string[] = [
    owner === undefined
      ? header.replace(/^[^\n]*/, `// ${GENERATED_BY} — colour tokens shared by every view of this library.`)
      : header,
    `//`,
    adaptive
      ? `// ${set.tokens.length} tokens: ${semantic.length} adaptive (light/dark pairs), ${set.tokens.length - semantic.length} static.`
      : `// ${set.tokens.length} tokens, all static.`,
    `// ${slots} colour slots carry them; ${set.inlineSlots} single-use colours${adaptive ? " identical in both themes" : ""} stay inline.`,
    ...(palette
      ? [
          `// Palette map: ${set.tokens.filter((t) => paletteEntry(t, palette)).length} of ${set.tokens.length} tokens use app colours; the others keep the captured values.`,
        ]
      : []),
    `import SwiftUI`,
    ``,
    ...(owner === undefined ? [`${access}enum Palette {`] : [`extension ${owner} {`, `    enum Palette {`]),
  ];
  for (const t of set.tokens) {
    const where = t.uses.length === 1 ? `1 use` : `${t.uses.length} uses`;
    const doc = `${pad}/// ${t.role} · ${where}${t.hint ? ` · --${t.hint}` : ""}`;
    const mapped = palette && paletteEntry(t, palette);
    if (mapped) {
      const captured = t.kind === "semantic" ? `${tokenHex(t.light)} / ${tokenHex(t.dark)}` : tokenHex(t.light);
      out.push(`${doc} · app colour from palette key ${mapped.key}; captured ${captured}`);
      out.push(`${pad}${access}static let ${t.name} = ${mapped.swift}`);
      continue;
    }
    out.push(doc);
    out.push(
      t.kind === "semantic"
        ? `${pad}${access}static let ${t.name} = Color.markswift(light: .markswift(${colorArgs(t.light)}), dark: .markswift(${colorArgs(t.dark)}))`
        : `${pad}${access}static let ${t.name} = Color.markswift(${colorArgs(t.light)})`,
    );
  }
  out.push(...(owner === undefined ? [`}`] : [`    }`, `}`]));
  return out.join("\n") + "\n";
}

/** `#rrggbb`, plus `aa` when not opaque; lowercase. */
export function tokenHex(c: Color): string {
  const byte = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  const hex = (x: number) => byte(x).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${byte(c.a) < 255 ? hex(c.a) : ""}`;
}

/** Palette-map keys that can name `t`, strongest first: its CSS variable, then its hex (`#light/#dark` when adaptive). */
function paletteKeys(t: ColorToken): string[] {
  const hex = t.kind === "semantic" ? `${tokenHex(t.light)}/${tokenHex(t.dark)}` : tokenHex(t.light);
  return t.hint ? [`--${t.hint}`, hex] : [hex];
}

/** Map key as written, compared in canonical form: hex keys ignore case, CSS variables do not. */
const canonical = (key: string) => (key.startsWith("#") ? key.toLowerCase() : key);

/** The map entry that replaces `t`'s value; the first of {@link paletteKeys} present wins. */
export function paletteEntry(t: ColorToken, map: PaletteMap): { key: string; swift: string } | undefined {
  for (const want of paletteKeys(t)) {
    const key = Object.keys(map).find((k) => canonical(k) === want);
    if (key !== undefined) return { key, swift: map[key]! };
  }
  return undefined;
}

/** Unmapped tokens (with the key each could use) and map keys that matched no token; `[]` when the map is exact. */
export function paletteWarnings(set: TokenSet, map: PaletteMap): ConversionWarning[] {
  const unmapped = set.tokens.filter((t) => !paletteEntry(t, map));
  const keys = new Set(set.tokens.flatMap(paletteKeys));
  const unused = Object.keys(map).filter((k) => !keys.has(canonical(k)));
  const warnings: ConversionWarning[] = [];
  if (unmapped.length)
    warnings.push({
      source: "palette",
      message: `${unmapped.length} token(s) have no entry in the palette map and keep their captured colour: ${unmapped.map((t) => `${t.name} (${paletteKeys(t)[0]})`).join(", ")}`,
    });
  if (unused.length)
    warnings.push({
      source: "palette",
      message: `${unused.length} palette map ${unused.length === 1 ? "entry" : "entries"} matched no token: ${unused.join(", ")}`,
    });
  return warnings;
}
