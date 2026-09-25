import type { Screen } from "../../model/semantic.ts";
import type { ScreenTokens } from "../context.ts";
import type { TokenSet } from "./types.ts";
/**
 * Reduce every screen of a run — both themes — to a token set.
 *
 * A slot whose light and dark colours differ becomes a semantic token; a colour identical in
 * both themes and used at two or more slots becomes a static token; a single-use identical
 * colour stays inline. Names come from the CSS custom property the IR recorded when one can be
 * attributed unambiguously, otherwise from role and colour (`fillBlue`, `textPrimary`), with a
 * numeric suffix on collision. Deterministic: the same screens produce the same names.
 */
export declare function extractTokens(screens: Screen[]): TokenSet;
/**
 * The token lookup for one screen: binds the screen group and theme, so the emitters ask only
 * "which token does this node's colour name here?". A miss — an unenumerated colour, or one
 * two tokens claim on the same node — leaves the literal in place.
 */
export declare function screenTokens(set: TokenSet, screen: Screen): ScreenTokens;
