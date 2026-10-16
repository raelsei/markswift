/**
 * Breakpoint conversions (D-BREAKPOINTS): the per-band screens of one capture set become one SemNode tree. A DOM
 * element whose authored inputs are equal in every band is emitted once from one inference and reflows natively;
 * one whose inputs differ becomes a holder whose `alternatives` the emitter chooses between at layout time.
 */
import { isDeepStrictEqual } from "node:util";
import { bandOf, matchesWidth, px, widthQuery } from "../css/index.ts";
import type { LayoutDoc, LayoutNode } from "../model/layout.ts";
import { type BandEdge, type ConversionWarning, type SemNode, type Screen, walk } from "../model/semantic.ts";
import { bandNames, isContainerQuery, planBands, uniqueEdges } from "./bands.ts";

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

/** Root-proposal edges of a set of band captures, or the reason the root does not follow the viewport. Every band
 * holds a capture, ascending by width; more than one only on pages with container queries (the planner's `extra`). */
export function bandEdges(docs: LayoutDoc[]): { edges: BandEdge[]; cssEdges: BandEdge[] } | { warning: string } {
  const first = docs[0]!;
  // The capture's own planner (dedupe, range, six-band cap), so compile and capture agree on the edges.
  const cssEdges = planBands(first.conditions, {
    first: { width: first.viewport.w, height: first.viewport.h },
    devices: [],
    max: docs.at(-1)!.viewport.w,
  }).edges;
  const bands = docs.map((d) => bandOf(d.viewport.w, cssEdges));
  if (
    bands[0] !== 0 ||
    bands.at(-1) !== cssEdges.length ||
    docs.some((d, i) => i > 0 && (d.viewport.w <= docs[i - 1]!.viewport.w || bands[i]! - bands[i - 1]! > 1)) ||
    (docs.length !== cssEdges.length + 1 && !first.conditions.some(isContainerQuery))
  )
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

/** One capture group of `compose`: `doc` represents the captures of `pool` (its own first) and shows as band `label`. */
interface Entry {
  doc: number;
  label: number;
  pool: number[];
}

/**
 * Compose per-capture screens into one root with holders and query containers; undefined when no element differs
 * between captures and nothing is reported (the root is band 0's when only warnings are). `bands`: each capture's
 * viewport band (ascending; default one capture per band). A band's lowest
 * capture represents it; the others are container-query captures, seen only by the query containers inside.
 */
export function mergeBands(
  docs: LayoutDoc[],
  screens: Screen[],
  bands: number[] = docs.map((_, i) => i),
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
  /** `G` split by `key`, groups ordered by their first entry. */
  const group = (G: Entry[], key: (e: Entry) => string) => {
    const out = new Map<string, Entry[]>();
    for (const e of G) {
      const k = key(e);
      const H = out.get(k);
      if (H) H.push(e);
      else out.set(k, [e]);
    }
    return [...out.values()];
  };
  // ponytail: a holder copies its first alternative's size and alignment, so a parent whose layout depends on a
  // child's height kind (`hugsRowHeight`, measured frames) lays it out as that band. Upgrade: per-band parents.
  const holder = (n: SemNode, groups: Entry[][], member: (H: Entry[]) => SemNode): SemNode => {
    const alternatives = groups.map((H) => ({ ...member(H), bands: H.map((e) => e.label) }));
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
  const byDeep = (n: SemNode, G: Entry[]) =>
    holder(
      n,
      group(G, (e) => deep(e.doc, n.id) ?? "\u0000"),
      (H) => lookup(H[0]!.doc, n.id),
    );
  const warnings: ConversionWarning[] = [];
  const warned = new Set<string>();
  const kids = (n: SemNode) => (n.kind === "stack" || n.kind === "grid" ? n.children : []);

  const structural = (n: SemNode, G: Entry[]): SemNode => {
    const g = G[0]!.doc;
    const nodes = G.map((e) => layout[e.doc]!.get(n.id));
    if (LEAF[n.kind] && hosts.has(n.id)) hosted(n, G); // a leaf host only reports its queries
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
    const keyOf = ({ doc: b }: Entry) => {
      const ln = layout[b]!.get(n.id);
      const s = lookup(b, n.id);
      const overlays = s.overlays.map((o) => deep(b, o.node.id) ?? o.node.id);
      const sized = JSON.stringify([s.width, s.height, s.selfAlign, s.selfAlignV]);
      return `${ln ? own(ln) : "\u0000"}|${overlays.join(",")}|${sized}`;
    };
    const groups = group(G, keyOf);
    if (groups.length > 1) return holder(n, groups, (H) => compose(lookup(H[0]!.doc, n.id), H));
    // Own inputs equal: align the children by id; a band that dropped, hoisted or restructured one cannot.
    const ids = kids(n).map((c) => c.id);
    if (
      G.some(
        (e) =>
          !isDeepStrictEqual(
            kids(lookup(e.doc, n.id)).map((c) => c.id),
            ids,
          ),
      )
    )
      throw new Unaligned();
    return hosted(n, G) ?? descend(n, G);
  };
  const descend = (n: SemNode, G: Entry[]): SemNode => {
    const children = kids(n).map((c) => compose(c, G));
    return children.every((c, i) => c === kids(n)[i]) ? n : ({ ...n, children } as SemNode);
  };
  const compose = (n: SemNode, G: Entry[]): SemNode => {
    if (n.id === "") return n;
    const keys = G.flatMap((e) => e.pool.map((b) => deep(b, n.id)));
    if (keys.every((k) => k === keys[0])) return n;
    // Representatives equal: the differences lie between captures of one band, seen only by query containers.
    const first = deep(G[0]!.doc, n.id);
    if (G.every((e) => deep(e.doc, n.id) === first)) return hosted(n, G) ?? descend(n, G);
    try {
      return structural(n, G);
    } catch (e) {
      if (e instanceof Unaligned) return byDeep(n, G);
      throw e;
    }
  };

  // Query containers (D-BREAKPOINTS BP5): host id → its width `@container` queries.
  const hosts = new Map<string, string[]>();
  for (const d of docs)
    for (const c of d.conditions)
      if (isContainerQuery(c)) {
        const queries = hosts.get(c.container!) ?? [];
        if (!queries.includes(c.query)) hosts.set(c.container!, [...queries, c.query]);
      }
  const contentWidth = (ln: LayoutNode) =>
    ln.bounds.w -
    px(ln.styles["padding-left"]) -
    px(ln.styles["padding-right"]) -
    px(ln.styles["border-left-width"]) -
    px(ln.styles["border-right-width"]);
  const warn = (key: string, message: string) => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push({ source: "breakpoints", level: "approximated", feature: "container-query", message });
  };
  /**
   * Host `n` over the captures of `G`: its children composed per container band (the lowest capture of each band
   * represents it), inside `containerBands`; undefined when it is no host, does not cross an edge or cannot switch.
   */
  const hosted = (n: SemNode, G: Entry[]): SemNode | undefined => {
    const queries = hosts.get(n.id);
    if (!queries) return undefined;
    const pool = G.flatMap((e) => e.pool).sort((a, b) => a - b);
    const nodes = pool.map((b) => layout[b]!.get(n.id));
    if (nodes.some((ln) => !ln)) return undefined;
    const edges = uniqueEdges(
      queries.flatMap((q) => {
        const w = widthQuery(q)!;
        return [w.above, w.below].filter((e) => e !== undefined);
      }),
    );
    const ks = nodes.map((ln) => bandOf(contentWidth(ln!), edges));
    if (ks.every((k) => k === ks[0])) return undefined;
    if ((n.kind !== "stack" && n.kind !== "grid") || n.scroll) {
      for (const q of queries)
        warn(
          `unsupported\u0000${n.id}\u0000${q}`,
          `@container ${q} on ${n.id}: the container is not a stack or grid (or scrolls); the query is not reconstructed`,
        );
      return undefined;
    }
    const byBand = new Map<number, number[]>();
    pool.forEach((b, i) => byBand.set(ks[i]!, [...(byBand.get(ks[i]!) ?? []), b]));
    const G2 = [...byBand].sort((a, b) => a[0] - b[0]).map(([label, H]): Entry => ({ doc: H[0]!, label, pool: H }));
    const ids = kids(n).map((c) => c.id);
    if (
      G2.some(
        (e) =>
          !isDeepStrictEqual(
            kids(idx[e.doc]!.get(n.id) ?? n).map((c) => c.id),
            ids,
          ),
      )
    ) {
      for (const q of queries)
        warn(
          `unaligned\u0000${n.id}\u0000${q}`,
          `@container ${q} on ${n.id}: its content changes structure between container widths; the query is not reconstructed`,
        );
      return undefined;
    }
    // ponytail: inside a host, media differences at the same container band keep the lower capture's content
    // (reported). Upgrade: split the band's pool by viewport band and nest holders.
    if (G2.some((e) => e.pool.some((b) => deep(b, n.id) !== deep(e.doc, n.id))))
      warn(
        `both\u0000${n.id}`,
        `${n.id}: container and media queries both restyle its content at the same container width; the container query is reconstructed, the media difference is not`,
      );
    const children = kids(n).map((c) => compose(c, G2));
    if (children.every((c, i) => c === kids(n)[i])) return undefined;
    return { ...n, children, containerBands: { edges, names: bandNames(edges, "cq_") } } as SemNode;
  };

  const viewport: Entry[] = [];
  bands.forEach((band, doc) => {
    const last = viewport.at(-1);
    if (last?.label === band) last.pool.push(doc);
    else viewport.push({ doc, label: band, pool: [doc] });
  });
  // A host that stays on one side of a query in every capture of a viewport band never shows its styles there.
  for (const [host, queries] of hosts)
    for (const e of viewport) {
      const widths = e.pool.flatMap((b) => {
        const ln = layout[b]!.get(host);
        return ln ? [round(contentWidth(ln))] : [];
      });
      for (const q of widths.length ? queries : []) {
        const w = widthQuery(q)!;
        if (widths.some((x) => matchesWidth(w, x))) continue;
        warn(
          `never\u0000${host}\u0000${q}`,
          `@container ${q} on ${host}: the container is ${Math.min(...widths)}–${Math.max(...widths)}px wide at every captured width and never crosses ${(w.above ?? w.below)!.px}px; add a device width where it does (breakpoints devices)`,
        );
      }
    }
  const root = compose(screens[0]!.root, viewport);
  return root === screens[0]!.root && !warnings.length ? undefined : { root, warnings };
}
