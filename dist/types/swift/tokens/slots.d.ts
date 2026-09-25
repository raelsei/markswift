import type { Screen, SemNode } from "../../model/semantic.ts";
import type { Slot, Usage } from "./types.ts";
/**
 * Every colour one node paints, in a deterministic order. Keys are stable across themes so
 * the same slot of the same node can be paired: that pairing is what makes a token semantic.
 */
export declare function colorSlots(n: SemNode): Slot[];
/** `home-light` + theme `light` → `home`; a name without the suffix is its own base. */
export declare function screenBase(screen: Screen): string;
/**
 * Pair the themes slot by slot. Screens are grouped by {@link screenBase}; inside a group the
 * light screen drives document order and the dark screen supplies the second value. Slots that
 * exist in one theme only stay unpaired — they can still make a static token, never a semantic
 * one, because there is no counterpart to prove the colour changes.
 */
export declare function pairUsages(screens: Screen[]): Usage[];
