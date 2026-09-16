import type { Color } from "../../css/index.ts";
import type { Theme } from "../../input/types.ts";
import type { Screen } from "../../model/semantic.ts";
import type { ScreenTokens } from "../context.ts";
import type { Usage, TokenSet, TokenRole, ColorToken, TokenIndex } from "./types.ts";
import { pairUsages, screenBase } from "./slots.ts";
import { camelize, tone, assignHints } from "./naming.ts";

/** Identity of a colour value; the grouping key and the index key both use it. */
function colorKey(c: Color): string {
  return `${c.r},${c.g},${c.b},${c.a}`;
}

/**
 * Reduce every screen of a run — both themes — to a token set.
 *
 * A slot whose light and dark colours differ becomes a semantic token; a colour identical in
 * both themes and used at two or more slots becomes a static token; a single-use identical
 * colour stays inline. Names come from the CSS custom property the IR recorded when one can be
 * attributed unambiguously, otherwise from role and colour (`fillBlue`, `textPrimary`), with a
 * numeric suffix on collision. Deterministic: the same screens produce the same names.
 */
export function extractTokens(screens: Screen[]): TokenSet {
  const usages = pairUsages(screens);
  const groups = new Map<string, Usage[]>();
  for (const u of usages) {
    const l = colorKey(u.light);
    const d = u.dark ? colorKey(u.dark) : l;
    const k = d === l ? `C:${l}` : `S:${l}|${d}`;
    const g = groups.get(k);
    if (g) g.push(u);
    else groups.set(k, [u]);
  }
  const hints = assignHints(groups);
  const kept = [...groups.entries()].filter(([k, us]) => k.startsWith("S:") || us.length >= 2);
  kept.sort((a, b) => a[1][0]!.order - b[1][0]!.order);
  const used = new Set<string>();
  const tokens: ColorToken[] = [];
  const index: TokenIndex = new Map();
  const ambiguous = new Set<string>();
  const put = (base: string, theme: Theme, id: string, c: Color, name: string): void => {
    const k = `${base}\u0000${theme}\u0000${id}\u0000${colorKey(c)}`;
    const cur = index.get(k);
    if (cur === undefined) index.set(k, name);
    else if (cur !== name) ambiguous.add(k);
  };
  for (const [k, us] of kept) {
    const semantic = k.startsWith("S:");
    // The dominant role decides the fallback name: most slots, ties by enumeration order.
    const counts = new Map<TokenRole, number>();
    for (const u of us) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    const role = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const hint = hints.get(k);
    const base = hint ? camelize(hint) : role === "canvas" ? "canvas" : role + tone(us[0]!.light);
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}${i}`;
    used.add(name);
    const uses: string[] = [];
    for (const u of us) if (!uses.includes(u.nodeId)) uses.push(u.nodeId);
    // The two values of one slot are two index entries: the light view paints the light value,
    // the dark view the dark one, and both resolve to this single name.
    for (const u of us) {
      put(u.base, u.theme, u.nodeId, u.light, name);
      if (u.dark) put(u.base, u.theme === "light" ? "dark" : "light", u.nodeId, u.dark, name);
    }
    tokens.push({
      name,
      kind: semantic ? "semantic" : "static",
      light: us[0]!.light,
      dark: (semantic ? us[0]!.dark : us[0]!.light)!,
      role,
      ...(hint ? { hint } : {}),
      uses,
      slots: us.length,
      literals: us.reduce((n, u) => n + (u.dark ? 2 : 1), 0),
    });
  }
  for (const k of ambiguous) index.delete(k);
  const keptKeys = new Set(kept.map(([k]) => k));
  let inlineSlots = 0;
  for (const [k, us] of groups) if (!keptKeys.has(k)) inlineSlots += us.length;
  return { tokens, inlineSlots, replaceableLiterals: tokens.reduce((n, t) => n + t.literals, 0), index };
}

/**
 * The token lookup for one screen: binds the screen group and theme, so the emitters ask only
 * "which token does this node's colour name here?". A miss — an unenumerated colour, or one
 * two tokens claim on the same node — leaves the literal in place.
 */
export function screenTokens(set: TokenSet, screen: Screen): ScreenTokens {
  const prefix = `${screenBase(screen)}\u0000${screen.theme}\u0000`;
  return {
    name: (c, id) => (id === undefined ? undefined : set.index.get(`${prefix}${id}\u0000${colorKey(c)}`)),
  };
}
