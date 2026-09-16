import type { Color } from "../../css/index.ts";
import type { Theme } from "../../input/types.ts";
/** What a colour paints; drives the fallback name and the token-hint consistency check. */
export type TokenRole = "canvas" | "fill" | "border" | "text" | "shadow" | "icon";

/** One extracted colour token. `light === dark` for `kind: "static"`. */
export interface ColorToken {
  name: string;
  kind: "semantic" | "static";
  light: Color;
  dark: Color;
  /** Dominant role of its usages — the fallback name is derived from it. */
  role: TokenRole;
  /** CSS custom property the name came from, when the IR carried a usable hint. */
  hint?: string;
  /** Node ids that paint with this token, in document order, deduplicated. */
  uses: string[];
  /** Colour slots this token covers (a light/dark pair counts once). */
  slots: number;
  /** Literals in the emitted views a rewrite would replace (a pair counts twice). */
  literals: number;
}

/**
 * Where the view emitter resolves a literal: `base\0theme\0nodeId\0r,g,b,a` → token name.
 *
 * The call sites that paint a colour do not know which named slot of the node they are
 * painting (a `.shadow(color:)` line only has the `Shadow`), so the key is the colour value
 * the node paints in the theme being emitted. Keyed per node, because one value can be two
 * tokens in one screen — the same light colour with two different dark counterparts. A key
 * two tokens claim is absent from the index: ambiguity keeps the literal instead of guessing
 * the other theme.
 */
export type TokenIndex = Map<string, string>;

/** Result of {@link extractTokens}. */
export interface TokenSet {
  /** Tokens in first-use order: semantic and static interleaved as the design uses them. */
  tokens: ColorToken[];
  /** Colour slots left inline: single-use colours that are identical in both themes. */
  inlineSlots: number;
  /** Colour slots the tokens cover — the literals the views no longer carry (a pair counts twice). */
  replaceableLiterals: number;
  /** Resolution table for the emitters; see {@link screenTokens}. */
  index: TokenIndex;
}

/** A single colour slot of one node in one theme. */
export interface Slot {
  /** Stable within a node: `fill0`, `border.top`, `run1.dec`, `path3.stroke`. */
  key: string;
  role: TokenRole;
  color: Color;
}

/** A colour slot after pairing the two themes. */
export interface Usage {
  /** Screen group ({@link screenBase}) this slot belongs to. */
  base: string;
  /** Theme whose screen supplied {@link Usage.light} — a dark-only group has no light screen. */
  theme: Theme;
  nodeId: string;
  slot: string;
  role: TokenRole;
  light: Color;
  /** Unset when the node/slot exists in one theme only. */
  dark?: Color;
  /** Custom-property names the node's declared style referenced. */
  hints: string[];
  /** Document-order index of the first theme that carried this slot. */
  order: number;
}
