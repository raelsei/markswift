import type { TokenSet } from "./types.ts";
import { colorArgs } from "../format.ts";
import { GENERATED_BY } from "../../model/version.ts";

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
 * `Palette` shared by every view of a generated library (`markswift build`).
 */
export function emitDesignTokens(
  set: TokenSet,
  owner: string | undefined,
  options: { adaptive?: boolean; visibility?: "internal" | "public" } = {},
): string {
  const adaptive = options.adaptive ?? false;
  const access = options.visibility === "public" ? "public " : "";
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
    `import SwiftUI`,
    ``,
    ...(owner === undefined ? [`${access}enum Palette {`] : [`extension ${owner} {`, `    enum Palette {`]),
  ];
  for (const t of set.tokens) {
    const where = t.uses.length === 1 ? `1 use` : `${t.uses.length} uses`;
    out.push(`${pad}/// ${t.role} · ${where}${t.hint ? ` · --${t.hint}` : ""}`);
    out.push(
      t.kind === "semantic"
        ? `${pad}${access}static let ${t.name} = Color.markswift(light: .markswift(${colorArgs(t.light)}), dark: .markswift(${colorArgs(t.dark)}))`
        : `${pad}${access}static let ${t.name} = Color.markswift(${colorArgs(t.light)})`,
    );
  }
  out.push(...(owner === undefined ? [`}`] : [`    }`, `}`]));
  return out.join("\n") + "\n";
}
