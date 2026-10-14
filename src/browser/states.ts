/**
 * Paint-only interaction states: force `:hover`+`:active` on every pressable element and
 * `:focus`+`:focus-visible` on every text field of the capture root, take one DOM snapshot per state,
 * and keep the paint properties that changed. Layout never comes from these snapshots.
 */
import type { CDPSession } from "playwright-core";
import { STYLE_WHITELIST } from "../model/layout.ts";
import { PRESSABLE_SELECTOR, TEXT_ENTRY_SELECTOR } from "../model/interactive.ts";
import type { DomSnapshot } from "./snapshot.ts";

/** Properties that move paint, not layout (all are in STYLE_WHITELIST). */
export const PAINT_KEYS = [
  "background-color",
  "background-image",
  "color",
  "-webkit-text-fill-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "box-shadow",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
  "opacity",
  "transform",
  "scale",
  "translate",
  "rotate",
  "filter",
  "text-decoration-color",
] as const;
const WATCH = ["display", "visibility"] as const;
const STATE_ARGS = { computedStyles: [...PAINT_KEYS, ...WATCH], includeDOMRects: true };
const KEEP: Readonly<Record<string, true>> = Object.fromEntries(STATE_ARGS.computedStyles.map((k) => [k, true]));

export type StateDeltas = Map<number, Record<string, string>>;

export async function forceStates(cdp: CDPSession, nodeIds: number[], classes: string[]): Promise<void> {
  await Promise.all(
    nodeIds.map((nodeId) => cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes })),
  );
}

interface Decoded {
  index: number;
  styles: Record<string, string>;
  offset?: number[];
}

/** Snapshot → per-node paint/watch styles keyed by `backendNodeId` (or node index when `byIndex`). */
function decode(snap: DomSnapshot, names: readonly string[], byIndex: boolean): Map<number, Decoded> {
  const doc = snap.documents[0]!;
  const out = new Map<number, Decoded>();
  doc.layout.nodeIndex.forEach((index, li) => {
    const styles: Record<string, string> = {};
    (doc.layout.styles[li] ?? []).forEach((v, k) => {
      if (v >= 0 && KEEP[names[k]!]) styles[names[k]!] = snap.strings[v]!;
    });
    const key = byIndex ? index : doc.nodes.backendNodeId![index]!;
    out.set(key, { index, styles, offset: doc.layout.offsetRects?.[li] });
  });
  return out;
}

/**
 * Per rest-snapshot node index, the paint keys whose value differs in `state`. Nodes are joined by
 * `backendNodeId` (index order when absent and the node counts match). A node whose offset box moved,
 * or whose display/visibility changed, contributes nothing and is counted instead.
 */
export function diffStates(
  rest: DomSnapshot,
  state: DomSnapshot,
  ignoreAutoOutline: boolean,
): { deltas: StateDeltas; moved: number; revealed: number } {
  const deltas: StateDeltas = new Map();
  const [r, s] = [rest.documents[0]?.nodes, state.documents[0]?.nodes];
  if (!r || !s) return { deltas, moved: 0, revealed: 0 };
  const byIndex = !r.backendNodeId || !s.backendNodeId;
  if (byIndex && r.nodeType.length !== s.nodeType.length) return { deltas, moved: 0, revealed: 0 };
  const before = decode(rest, STYLE_WHITELIST, byIndex);
  const after = decode(state, STATE_ARGS.computedStyles, byIndex);
  let moved = 0;
  let revealed = 0;
  for (const [key, b] of after) {
    const a = before.get(key);
    if (!a || WATCH.some((k) => a.styles[k] !== b.styles[k])) {
      revealed++;
      continue;
    }
    if (a.offset && b.offset && a.offset.some((v, i) => Math.abs(v - b.offset![i]!) > 0.5)) {
      moved++;
      continue;
    }
    const outlineAuto = ignoreAutoOutline && b.styles["outline-style"] === "auto";
    const changed: Record<string, string> = {};
    for (const k of PAINT_KEYS) {
      if (outlineAuto && k.startsWith("outline-")) continue;
      const v = b.styles[k];
      if (v !== undefined && v !== a.styles[k]) changed[k] = v;
    }
    if (Object.keys(changed).length) deltas.set(a.index, changed);
  }
  return { deltas, moved, revealed };
}

export async function captureStates(
  cdp: CDPSession,
  root: string,
  rest: DomSnapshot,
): Promise<{ pressed: StateDeltas; focused: StateDeltas; warnings: string[] }> {
  const out = { pressed: new Map() as StateDeltas, focused: new Map() as StateDeltas, warnings: [] as string[] };
  await cdp.send("DOM.enable");
  let css = false;
  try {
    const { root: doc } = await cdp.send("DOM.getDocument", { depth: 0 });
    const plan = [
      ["pressed", PRESSABLE_SELECTOR, ["hover", "active"], ":active"],
      ["focused", TEXT_ENTRY_SELECTOR, ["focus", "focus-visible"], ":focus-visible"],
    ] as const;
    for (const [state, selector, classes, label] of plan) {
      const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
        nodeId: doc.nodeId,
        selector: `${root} :is(${selector}), ${root}:is(${selector})`,
      });
      if (!nodeIds.length) continue;
      if (!css) await cdp.send("CSS.enable");
      css = true;
      await forceStates(cdp, nodeIds, [...classes]);
      try {
        const snap = (await cdp.send("DOMSnapshot.captureSnapshot", STATE_ARGS)) as unknown as DomSnapshot;
        const { deltas, moved, revealed } = diffStates(rest, snap, state === "focused");
        out[state] = deltas;
        if (moved > 0)
          out.warnings.push(`${moved} element(s) change layout under ${label}; their ${state} paint is not reproduced`);
        if (revealed > 0)
          out.warnings.push(`${revealed} element(s) appear or disappear under ${label}; not reproduced`);
      } finally {
        await forceStates(cdp, nodeIds, []);
      }
    }
  } finally {
    if (css) await cdp.send("CSS.disable");
    await cdp.send("DOM.disable");
  }
  return out;
}
