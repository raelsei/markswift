/**
 * Breakpoint conversions (D-BREAKPOINTS): the per-band screens of one capture set become one SemNode tree. A DOM
 * element whose authored inputs are equal in every band is emitted once from one inference and reflows natively;
 * one whose inputs differ becomes a holder whose `alternatives` the emitter chooses between at layout time.
 */
import { isDeepStrictEqual } from "node:util";
import { bandOf, px } from "../css/index.ts";
import type { LayoutDoc, LayoutNode } from "../model/layout.ts";
import { type BandEdge, type ConversionWarning, type SemNode, type Screen, walk } from "../model/semantic.ts";
import { planBands } from "./bands.ts";

/** Used px: the authored intent is `preferredSize`. */
const SKIP: Record<string, true> = { width: true, height: true };
/** Resolved px that move with the container width: compared only when a media/container rule hits the node. */
const FLUID: Record<string, true> = {
  "margin-top": true,
  "margin-right": true,
  "margin-bottom": true,
  "margin-left": true,
  "padding-top": true,
  "padding-right": true,
  "padding-bottom": true,
  "padding-left": true,
  top: true,
  right: true,
  bottom: true,
  left: true,
  transform: true,
  "transform-origin": true,
  translate: true,
  "grid-template-columns": true,
  "grid-template-rows": true,
};
const LEAF: Record<SemNode["kind"], boolean> = {
  text: true,
  image: true,
  svg: true,
  box: true,
  control: true,
  stack: false,
  grid: false,
};

const round = (n: number) => Math.round(n * 100) / 100;
const byKey = (a: [string, unknown], b: [string, unknown]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Root-proposal edges of a set of band captures, or the reason the root does not follow the viewport. */
export function bandEdges(docs: LayoutDoc[]): { edges: BandEdge[]; cssEdges: BandEdge[] } | { warning: string } {
  const first = docs[0]!;
  // The capture's own planner (dedupe, range, six-band cap), so compile and capture agree on the edges.
  const cssEdges = planBands(first.conditions, {
    first: { width: first.viewport.w, height: first.viewport.h },
    devices: [],
    max: docs.at(-1)!.viewport.w,
  }).edges;
  if (docs.length !== cssEdges.length + 1 || docs.some((d, i) => bandOf(d.viewport.w, cssEdges) !== i))
    throw new Error("options.variants must be one capture per width band in ascending order");
  const offset = (d: LayoutDoc) =>
    d.viewport.w - (d.root.bounds.w + px(d.root.styles["margin-left"]) + px(d.root.styles["margin-right"]));
  const base = offset(first);
  const off = docs.find((d) => Math.abs(offset(d) - base) > 0.5);
  if (off)
    return {
      warning: `the root does not follow the viewport width (viewport minus root width: ${round(base)}px at ${first.viewport.w}px, ${round(offset(off))}px at ${off.viewport.w}px); breakpoints are not reconstructed and the view keeps the ${first.viewport.w}px layout`,
    };
  return { edges: cssEdges.map((e) => ({ ...e, px: round(e.px - base) })), cssEdges };
}

/** A member lookup missed: the band dropped, hoisted or restructured the node. The nearest ancestor becomes a holder. */
class Unaligned extends Error {}

/** Compose per-band screens into one root with holders; undefined when no element differs between bands. */
export function mergeBands(
  docs: LayoutDoc[],
  screens: Screen[],
): { root: SemNode; warnings: ConversionWarning[] } | undefined {
  const layout = docs.map((d) => {
    const byId = new Map<string, LayoutNode>();
    const index = (n: LayoutNode) => {
      if (n.id !== undefined && !byId.has(n.id)) byId.set(n.id, n);
      for (const c of n.children) index(c);
    };
    index(d.root);
    return byId;
  });
  const idx = screens.map((s) => {
    const byId = new Map<string, SemNode>();
    walk(s.root, (n) => {
      if (n.id !== "" && !byId.has(n.id)) byId.set(n.id, n);
    });
    return byId;
  });
  const interned = new Map<string, string>();
  const intern = (s: string) => {
    let k = interned.get(s);
    if (k === undefined) interned.set(s, (k = `#${interned.size}`));
    return k;
  };
  // `states.open` and `doc.layers` exist on band 0 only (band captures skip the layer pass): never compared.
  const ownMemo = new Map<LayoutNode, string>();
  const own = (n: LayoutNode): string => {
    let key = ownMemo.get(n);
    if (key !== undefined) return key;
    const fluid = !n.conditional?.length;
    const { open: _, ...states } = n.states ?? {};
    key = intern(
      JSON.stringify([
        n.tag,
        n.text ?? "",
        Object.entries(n.attrs).sort(byKey),
        n.currentSrc ?? "",
        Object.entries(n.styles)
          .filter(([k]) => !SKIP[k] && !(fluid && FLUID[k]))
          .sort(byKey),
        n.preferredSize ?? null,
        Object.keys(states).length ? states : null,
        n.children.map((c) => (c.tag === "#text" ? `#text:${c.text ?? ""}` : (c.id ?? ""))),
      ]),
    );
    ownMemo.set(n, key);
    return key;
  };
  const deepMemo = new Map<LayoutNode, string>();
  const deepOf = (n: LayoutNode): string => {
    let key = deepMemo.get(n);
    if (key === undefined) deepMemo.set(n, (key = intern(`${own(n)}[${n.children.map(deepOf).join(",")}]`)));
    return key;
  };
  const deep = (b: number, id: string) => {
    const n = layout[b]!.get(id);
    return n && deepOf(n);
  };
  const lookup = (b: number, id: string) => {
    const n = idx[b]!.get(id);
    if (!n) throw new Unaligned();
    return n;
  };
  /** `G` split by `key`, groups ordered by their lowest band. */
  const group = (G: number[], key: (b: number) => string) => {
    const out = new Map<string, number[]>();
    for (const b of G) {
      const k = key(b);
      const H = out.get(k);
      if (H) H.push(b);
      else out.set(k, [b]);
    }
    return [...out.values()];
  };
  // ponytail: a holder copies its first alternative's size and alignment, so a parent whose layout depends on a
  // child's height kind (`hugsRowHeight`, measured frames) lays it out as that band. Upgrade: per-band parents.
  const holder = (n: SemNode, groups: number[][], member: (H: number[]) => SemNode): SemNode => {
    const alternatives = groups.map((H) => ({ ...member(H), bands: H }));
    const first = alternatives[0]!;
    return {
      kind: "box",
      id: n.id,
      frame: first.frame,
      width: first.width,
      height: first.height,
      ...(first.selfAlign ? { selfAlign: first.selfAlign } : {}),
      ...(first.selfAlignV ? { selfAlignV: first.selfAlignV } : {}),
      padding: [0, 0, 0, 0],
      style: { fills: [], shadows: [] },
      confidence: "mapped",
      diagnostics: [],
      overlays: [],
      alternatives,
    };
  };
  const byDeep = (n: SemNode, G: number[]) =>
    holder(
      n,
      group(G, (b) => deep(b, n.id) ?? "\u0000"),
      (H) => lookup(H[0]!, n.id),
    );
  const warnings: ConversionWarning[] = [];
  const warned = new Set<string>();
  const kids = (n: SemNode) => (n.kind === "stack" || n.kind === "grid" ? n.children : []);

  const structural = (n: SemNode, G: number[]): SemNode => {
    const g = G[0]!;
    const nodes = G.map((b) => layout[b]!.get(n.id));
    if (LEAF[n.kind] || !nodes[0] || kids(n).some((c) => c.id !== "" && !layout[g]!.has(c.id))) return byDeep(n, G);
    // Script-driven DOM (D-BREAKPOINTS LCA rule): CSS cannot change a child's tag or a text node's text.
    const tags = new Map<string, string>();
    let mismatch = false;
    for (const ln of nodes)
      for (const c of ln?.children ?? []) {
        if (c.id === undefined) continue;
        const tag = tags.get(c.id);
        if (tag === undefined) tags.set(c.id, c.tag);
        else if (tag !== c.tag) mismatch = true;
      }
    const texts = nodes.map((ln) =>
      JSON.stringify(ln?.children.filter((c) => c.tag === "#text").map((c) => c.text) ?? []),
    );
    if (!nodes.some((ln) => ln?.conditional?.length) && texts.some((t) => t !== texts[0])) mismatch = true;
    if (mismatch) {
      if (!warned.has(n.id)) {
        warned.add(n.id);
        warnings.push({
          source: "breakpoints",
          level: "approximated",
          feature: "media-query",
          message: `script-driven DOM differs between viewports under ${n.id} (same element id, different tag or text); its subtree is emitted once per band`,
        });
      }
      return byDeep(n, G);
    }
    // Used size and alignment follow the children too (an inline-flex link's baseline sets its list item's height):
    // a band that infers others lays the node out differently, so it is its own alternative.
    const keyOf = (b: number) => {
      const ln = layout[b]!.get(n.id);
      const s = lookup(b, n.id);
      const overlays = s.overlays.map((o) => deep(b, o.node.id) ?? o.node.id);
      const sized = JSON.stringify([s.width, s.height, s.selfAlign, s.selfAlignV]);
      return `${ln ? own(ln) : "\u0000"}|${overlays.join(",")}|${sized}`;
    };
    const groups = group(G, keyOf);
    if (groups.length > 1) return holder(n, groups, (H) => compose(lookup(H[0]!, n.id), H));
    // Own inputs equal: align the children by id; a band that dropped, hoisted or restructured one cannot.
    const ids = kids(n).map((c) => c.id);
    if (
      G.some(
        (b) =>
          !isDeepStrictEqual(
            kids(lookup(b, n.id)).map((c) => c.id),
            ids,
          ),
      )
    )
      throw new Unaligned();
    const children = kids(n).map((c) => compose(c, G));
    return children.every((c, i) => c === kids(n)[i]) ? n : ({ ...n, children } as SemNode);
  };
  const compose = (n: SemNode, G: number[]): SemNode => {
    if (n.id === "" || G.length === 1) return n;
    const keys = G.map((b) => deep(b, n.id));
    if (keys.every((k) => k === keys[0])) return n;
    try {
      return structural(n, G);
    } catch (e) {
      if (e instanceof Unaligned) return byDeep(n, G);
      throw e;
    }
  };
  const root = compose(
    screens[0]!.root,
    screens.map((_, i) => i),
  );
  return root === screens[0]!.root ? undefined : { root, warnings };
}
