import type { Color } from "../../css/index.ts";
import type { Usage } from "./types.ts";
const SWIFT_KEYWORDS: Record<string, true> = {
  associatedtype: true, class: true, deinit: true, enum: true, extension: true, fileprivate: true, func: true,
  import: true, init: true, inout: true, internal: true, let: true, open: true, operator: true, private: true,
  precedencegroup: true, protocol: true, public: true, rethrows: true, static: true, struct: true, subscript: true,
  typealias: true, var: true, break: true, case: true, catch: true, continue: true, default: true, defer: true,
  do: true, else: true, fallthrough: true, for: true, guard: true, if: true, in: true, repeat: true, return: true,
  throw: true, throws: true, try: true, where: true, while: true, as: true, false: true, is: true, nil: true,
  self: true, super: true, true: true, Any: true, Protocol: true, Type: true, some: true, each: true,
  borrowing: true, consuming: true, nonisolated: true,
};

/** `surface-raised` → `surfaceRaised`; always a valid, non-keyword Swift member name. */
export function camelize(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return "color";
  const head = parts[0]!;
  const camel = head.charAt(0).toLowerCase() + head.slice(1) + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  const safe = /^\d/.test(camel) ? `c${camel}` : camel;
  return SWIFT_KEYWORDS[safe] ? `${safe}Color` : safe;
}

const HUES: Array<[number, string]> = [
  [15, "Red"], [45, "Orange"], [70, "Yellow"], [100, "Lime"], [160, "Green"], [200, "Teal"],
  [250, "Blue"], [280, "Indigo"], [320, "Purple"], [345, "Pink"], [360, "Red"],
];

/** Grey ramp, dark → light. Reads as a design vocabulary rather than as a luminance number. */
const TONES: Array<[number, string]> = [
  [0.06, "Black"], [0.25, "Primary"], [0.5, "Secondary"], [0.72, "Tertiary"], [0.9, "Subtle"], [0.99, "Surface"], [1.01, "White"],
];

/**
 * Human-ish colour label: hue name when the colour reads as coloured, grey-ramp tone when it
 * reads as neutral. "Coloured" is HSV saturation, not raw chroma — a near-black `#0B0F14` has
 * a blue hue on paper and none to the eye, and a slate `#8A93A0` is a grey in a design system.
 */
export function tone(c: Color): string {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma < 0.08 || chroma / max < 0.25) return TONES.find(([l]) => max < l)?.[1] ?? "White";
  const h = 60 * (max === c.r ? ((c.g - c.b) / chroma + 6) % 6 : max === c.g ? (c.b - c.r) / chroma + 2 : (c.r - c.g) / chroma + 4);
  return HUES.find(([deg]) => h < deg)![1];
}

/**
 * Assign custom-property hints to colour groups. `Style.tokens` is a per-node *set* — the IR
 * knows a node referenced `var(--card)` but not which slot it painted. A colour custom
 * property is by definition constant, so the slot it names is the one that resolves to a
 * single colour across every node referencing the property, on most of those nodes: `--muted`
 * is one colour at `run0` everywhere it appears, while `--fd` (a font family) sits on nodes
 * whose text runs are five different colours and so names nothing. Hints without a consistent
 * slot are dropped rather than guessed.
 */
export function assignHints(groups: Map<string, Usage[]>): Map<string, string> {
  const byHint = new Map<string, Usage[]>();
  const groupOf = new Map<string, string>();
  for (const [g, us] of groups) {
    for (const u of us) {
      groupOf.set(`${u.nodeId}\u0000${u.slot}\u0000${u.order}`, g);
      for (const h of u.hints) {
        const list = byHint.get(h);
        if (list) list.push(u);
        else byHint.set(h, [u]);
      }
    }
  }
  type Candidate = { hint: string; group: string; nodes: number; slot: string; order: number };
  const candidates: Candidate[] = [];
  for (const [hint, us] of byHint) {
    const nodes = new Set(us.map((u) => u.nodeId));
    // Per slot key: which colour group every referencing node lands in.
    const bySlot = new Map<string, { group: string; nodes: Set<string>; order: number } | null>();
    for (const u of us) {
      const g = groupOf.get(`${u.nodeId}\u0000${u.slot}\u0000${u.order}`)!;
      const cur = bySlot.get(u.slot);
      if (cur === null) continue;
      if (!cur) bySlot.set(u.slot, { group: g, nodes: new Set([u.nodeId]), order: u.order });
      else if (cur.group !== g) bySlot.set(u.slot, null);
      else {
        cur.nodes.add(u.nodeId);
        cur.order = Math.min(cur.order, u.order);
      }
    }
    for (const [slot, hit] of bySlot) {
      if (!hit) continue;
      // One referencing node proves nothing unless the reference is unambiguous: a single
      // hint painting a single colour slot.
      if (nodes.size < 2 && !(us.length === 1 && us[0]!.hints.length === 1)) continue;
      // Nodes that lack the slot entirely (a card without a shadow) do not contradict it;
      // the slot still has to account for most of the property's uses to name it.
      if (hit.nodes.size * 2 < nodes.size) continue;
      candidates.push({ hint, group: hit.group, nodes: hit.nodes.size, slot, order: hit.order });
    }
  }
  const ROLE_RANK: Record<string, number> = { canvas: 0, fill: 1, border: 2, text: 3, shadow: 4, icon: 5 };
  const rank = (slot: string) => (slot.startsWith("fill") ? ROLE_RANK.fill! : slot.startsWith("border") || slot === "outline" ? ROLE_RANK.border! : slot.startsWith("run") ? ROLE_RANK.text! : slot.startsWith("shadow") || slot.startsWith("filter") ? ROLE_RANK.shadow! : slot === "canvas" ? ROLE_RANK.canvas! : ROLE_RANK.icon!);
  candidates.sort((a, b) => b.nodes - a.nodes || rank(a.slot) - rank(b.slot) || a.order - b.order || (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0));
  const named = new Map<string, string>();
  const takenHints = new Set<string>();
  for (const c of candidates) {
    if (named.has(c.group) || takenHints.has(c.hint)) continue;
    named.set(c.group, c.hint);
    takenHints.add(c.hint);
  }
  return named;
}
