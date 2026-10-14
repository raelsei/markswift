import type { Color } from "../../model/values.ts";
import type { Theme } from "../../model/layout.ts";
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
}

/**
 * App colours for captured tokens. Keys: a CSS custom property (`--primary`), a hex colour for a
 * static token (`#e2e8f0`, `#e2e8f080`), or `#light/#dark` for an adaptive one. Values: a Swift
 * `Color` expression (`Color.accentColor`, `Color("Card")`), emitted verbatim.
 */
export type PaletteMap = Readonly<Record<string, string>>;

/**
 * Where the view emitter resolves a literal: `base\0theme\0nodeId\0r,g,b,a` → token name, and
 * the same key plus `\0slot` for call sites that know the slot.
 *
 * Most call sites that paint a colour do not know which named slot of the node they are
 * painting (a `.shadow(color:)` line only has the `Shadow`), so the key is the colour value
 * the node paints in the theme being emitted. Keyed per node, because one value can be two
 * tokens in one screen — the same light colour with two different dark counterparts. A key
 * two tokens claim is absent from the index: ambiguity keeps the literal instead of guessing
 * the other theme; only the slot-qualified key resolves it.
 */
export type TokenIndex = Map<string, string>;

/** Result of {@link extractTokens}. */
export interface TokenSet {
  /** Tokens in first-use order: semantic and static interleaved as the design uses them. */
  tokens: ColorToken[];
  /** Colour slots left inline: single-use colours that are identical in both themes. */
  inlineSlots: number;
  /** Resolution table for the emitters; see {@link screenTokens}. */
  index: TokenIndex;
}

/** A single colour slot of one node in one theme. */
export interface Slot {
  /** Stable within a node: `fill0`, `border.top`, `run1.dec`, `path3.stroke`. */
  key: string;
  role: TokenRole;
  color: Color;
  /**
   * Which CSS gradient stop a gradient slot is — what a `from-`/`via-`/`to-` utility names:
   * the first, the last, and the middle one only when it is the only middle one.
   */
  stop?: "from" | "via" | "to";
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
  /** Token hints of the node: custom-property names and role-qualified class hints. */
  hints: string[];
  /** {@link Slot.stop} */
  stop?: "from" | "via" | "to";
  /** Document-order index of the first theme that carried this slot. */
  order: number;
}
