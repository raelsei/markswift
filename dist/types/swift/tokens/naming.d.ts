import type { Color } from "../../css/index.ts";
import type { Usage } from "./types.ts";
/** `surface-raised` → `surfaceRaised`; always a valid, non-keyword Swift member name. */
export declare function camelize(name: string): string;
/**
 * Human-ish colour label: hue name when the colour reads as coloured, grey-ramp tone when it
 * reads as neutral. "Coloured" is HSV saturation, not raw chroma — a near-black `#0B0F14` has
 * a blue hue on paper and none to the eye, and a slate `#8A93A0` is a grey in a design system.
 */
export declare function tone(c: Color): string;
/**
 * Assign custom-property hints to colour groups. `Style.tokens` is a per-node *set* — the IR
 * knows a node referenced `var(--card)` but not which slot it painted. A colour custom
 * property is by definition constant, so the slot it names is the one that resolves to a
 * single colour across every node referencing the property, on most of those nodes: `--muted`
 * is one colour at `run0` everywhere it appears, while `--fd` (a font family) sits on nodes
 * whose text runs are five different colours and so names nothing. Hints without a consistent
 * slot are dropped rather than guessed.
 */
export declare function assignHints(groups: Map<string, Usage[]>): Map<string, string>;
