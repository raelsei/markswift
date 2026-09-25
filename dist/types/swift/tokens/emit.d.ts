import type { TokenSet } from "./types.ts";
/**
 * `MarkswiftTokens.swift`: the `Color(light:dark:)` initialiser plus one `static let` per token.
 * Static tokens emit a single colour; semantic tokens emit the pair.
 */
export declare function emitDesignTokens(set: TokenSet): string;
/** `tokens.json` payload: `name → { light, dark, uses }`, plus the counts the header reports. */
export declare function tokensJson(set: TokenSet): string;
