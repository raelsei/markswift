import type { Color } from "../../model/values.ts";
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

const side = (...keys: string[]) => (u: Usage) => u.slot === "border" || keys.includes(u.slot);

/**
 * Slots a role-qualified class hint may name, by utility prefix (`bg:white` → a solid fill).
 * A prefix missing here names nothing: `divide-` colours the children's borders, `ring-offset-`
 * shares the shadow slots with `ring-`, `accent-`/`caret-`/`placeholder-` paint nothing the IR
 * records, and an svg's `text-` colour reaches only the paths that use `currentColor`.
 */
const HINT_SLOTS: Record<string, (u: Usage) => boolean> = {
  bg: (u) => /^fill\d+$/.test(u.slot),
  from: (u) => u.stop === "from" && /^fill\d+\./.test(u.slot),
  via: (u) => u.stop === "via" && /^fill\d+\./.test(u.slot),
  to: (u) => u.stop === "to" && /^fill\d+\./.test(u.slot),
  text: (u) => /^run\d+$/.test(u.slot) || u.slot === "control" || u.slot === "alt",
  decoration: (u) => /^run\d+\.dec$/.test(u.slot),
  border: (u) => u.slot === "border" || u.slot.startsWith("border."),
  "border-t": side("border.top"),
  "border-r": side("border.right"),
  "border-b": side("border.bottom"),
  "border-l": side("border.left"),
  "border-x": side("border.left", "border.right"),
  "border-y": side("border.top", "border.bottom"),
  outline: (u) => u.slot === "outline",
  // A Tailwind ring is a box-shadow, so it shares the shadow slots with `shadow-`.
  ring: (u) => /^shadow\d+$/.test(u.slot),
  shadow: (u) => /^shadow\d+$/.test(u.slot),
  fill: (u) => /^path\d+\.fill$/.test(u.slot),
  stroke: (u) => /^path\d+\.stroke$/.test(u.slot),
};

/**
 * Assign token hints to colour groups. `Style.tokens` is a per-node *set*. A role-qualified
 * class hint (`bg:white`, `from:sky-500`) names the slots of its utility ({@link HINT_SLOTS}),
 * and only when they paint one colour on that node. A custom property is subtler — the IR knows
 * a node referenced `var(--card)` but not which slot it painted. A colour custom property is by
 * definition constant, so the slot it names is the one that resolves to a single colour across
 * every node referencing the property, on most of those nodes: `--muted` is one colour at `run0`
 * everywhere it appears, while `--fd` (a font family) sits on nodes whose text runs are five
 * different colours and so names nothing. Hints without a consistent slot are dropped rather
 * than guessed, and so is a colour two names claim equally.
 */
export function assignHints(groups: Map<string, Usage[]>): Map<string, string> {
  const groupOf = new Map<Usage, string>();
  const byNode = new Map<string, Usage[]>();
  for (const [g, us] of groups) {
    for (const u of us) {
      groupOf.set(u, g);
      const k = `${u.base}\u0000${u.nodeId}`;
      const list = byNode.get(k);
      if (list) list.push(u);
      else byNode.set(k, [u]);
    }
  }
  const byHint = new Map<string, Usage[]>();
  for (const us of byNode.values()) {
    for (const h of us[0]!.hints) {
      const colon = h.indexOf(":");
      let hits = us;
      if (colon >= 0) {
        const fits = HINT_SLOTS[h.slice(0, colon)];
        hits = fits ? us.filter(fits) : [];
        if (new Set(hits.map((u) => groupOf.get(u))).size !== 1) continue;
      }
      const list = byHint.get(h);
      if (list) list.push(...hits);
      else byHint.set(h, [...hits]);
    }
  }
  type Candidate = { name: string; group: string; nodes: number; slot: string; order: number };
  const candidates: Candidate[] = [];
  for (const [hint, us] of byHint) {
    const qualified = hint.includes(":");
    const nodes = new Set(us.map((u) => u.nodeId));
    // Per slot key: which colour group every referencing node lands in.
    const bySlot = new Map<string, { group: string; nodes: Set<string>; order: number } | null>();
    for (const u of us) {
      const g = groupOf.get(u)!;
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
      // One referencing node proves nothing unless the reference is unambiguous: a class hint
      // already pinned to its slot, or a single custom property painting a single colour slot.
      if (nodes.size < 2 && !qualified && !(us.length === 1 && us[0]!.hints.length === 1)) continue;
      // Nodes that lack the slot entirely (a card without a shadow) do not contradict it;
      // the slot still has to account for most of the property's uses to name it.
      if (hit.nodes.size * 2 < nodes.size) continue;
      candidates.push({ name: qualified ? hint.slice(hint.indexOf(":") + 1) : hint, group: hit.group, nodes: hit.nodes.size, slot, order: hit.order });
    }
  }
  const ROLE_RANK: Record<string, number> = { canvas: 0, fill: 1, border: 2, text: 3, shadow: 4, icon: 5 };
  const rank = (slot: string) => (slot.startsWith("fill") ? ROLE_RANK.fill! : slot.startsWith("border") || slot === "outline" ? ROLE_RANK.border! : slot.startsWith("run") ? ROLE_RANK.text! : slot.startsWith("shadow") || slot.startsWith("filter") ? ROLE_RANK.shadow! : slot === "canvas" ? ROLE_RANK.canvas! : ROLE_RANK.icon!);
  candidates.sort((a, b) => b.nodes - a.nodes || rank(a.slot) - rank(b.slot) || a.order - b.order);
  const named = new Map<string, string>();
  const contested = new Set<string>();
  const takenNames = new Set<string>();
  for (const c of candidates) {
    if (named.has(c.group) || contested.has(c.group) || takenNames.has(c.name)) continue;
    // Two names equally good for one colour (`var(--surface)` and `var(--ink)` on the same nodes):
    // either could be the right one, so neither is used.
    if (candidates.some((d) => d.group === c.group && d.name !== c.name && !takenNames.has(d.name) && d.nodes === c.nodes && rank(d.slot) === rank(c.slot) && d.order === c.order)) {
      contested.add(c.group);
      continue;
    }
    named.set(c.group, c.name);
    takenNames.add(c.name);
  }
  return named;
}
