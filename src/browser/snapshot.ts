/**
 * CDP `DOMSnapshot.captureSnapshot` → LayoutNode tree.
 * The snapshot is columnar (parallel arrays + string table); this rebuilds a
 * tree, attaches whitelisted computed styles and document-relative bounds,
 * materialises `::before`/`::after`/`::marker`, hoists `display: contents`
 * children, then crops to the requested root and rebases coordinates to it.
 */
import type { LayoutNode, Rect } from "../model/layout.ts";
import { STYLE_WHITELIST } from "../model/layout.ts";
import type { NodeIdentity } from "../input/types.ts";
import type { PreferredSizes } from "./sizing.ts";

/** CDP `RareStringData`: sparse per-node strings (`value[k]` belongs to node `index[k]`). */
interface RareStringData {
  index: number[];
  value: number[];
}

/** Subset of the CDP response we read. */
export interface DomSnapshot {
  documents: Array<{
    documentURL: number;
    nodes: {
      nodeType: number[];
      nodeName: number[];
      nodeValue: number[];
      parentIndex: number[];
      attributes: number[][];
      /** `before` / `after` / `marker` / … for pseudo-element nodes. */
      pseudoType?: RareStringData;
      /** `img.currentSrc` (absolute URL) for every `<img>`. */
      currentSourceURL?: RareStringData;
    };
    layout: {
      nodeIndex: number[];
      styles: number[][];
      bounds: number[][];
      text: number[];
      paintOrders?: number[];
      /** `offsetLeft/Top/Width/Height` per laid-out node (`includeDOMRects`). */
      offsetRects?: number[][];
    };
    textBoxes: { layoutIndex: number[]; bounds: number[][]; start: number[]; length: number[] };
  }>;
  strings: string[];
}

interface Raw {
  idx: number;
  type: number;
  name: string;
  value: string;
  attrs: Record<string, string>;
  styles: Record<string, string>;
  preferredSize?: LayoutNode["preferredSize"];
  /** Snapshot bounds: border box for elements, line-box union for inline/text, the generated text's box for pseudo-elements. */
  bounds?: Rect;
  /** CSSOM offset rect (relative to the offsetParent's padding edge). */
  offset?: Rect;
  /** `before` / `after` / `marker` for pseudo-element nodes. */
  pseudo?: string;
  /** Pseudo-elements only: border box derived from `offset` (see `pseudoBox`). */
  box?: Rect;
  /** Text nodes: measured line boxes (`textBoxes`), in layout order; `start`/`length` index `text`. */
  lines?: Array<{ bounds: Rect; start: number; length: number }>;
  text?: string;
  paint?: number;
  parent?: Raw;
  children: Raw[];
}

const SKIP_TAGS: Record<string, true> = { script: true, style: true, link: true, meta: true, template: true, noscript: true };
/**
 * Nodes that never get a layout box but must survive: SVG paint servers, so fills/strokes can
 * resolve `url(#id)`, and `<option>`/`<optgroup>`, which Chrome lays out in the select popup
 * rather than in the page — their labels are read as text, never measured.
 */
const KEEP_WITHOUT_LAYOUT: Record<string, true> = { defs: true, lineargradient: true, radialgradient: true, stop: true, clippath: true, mask: true, option: true, optgroup: true };
/** Pseudo-elements that become LayoutNodes; every other `pseudoType` (first-letter, backdrop, scrollbar parts, …) is dropped. */
const PSEUDO_TAGS: Record<string, string> = { before: "::before", after: "::after", marker: "::marker" };

/** Join CSS size intent while wrappers still exist, before display:contents is flattened. */
export function attachPreferredSizes(root: Raw, sizes: PreferredSizes): void {
  const walk = (raw: Raw, path: string) => {
    if (Object.hasOwn(sizes, path)) raw.preferredSize = sizes[path];
    let i = 0;
    for (const child of raw.children) {
      if (child.type !== 1 || child.pseudo !== undefined) continue;
      const childPath = path ? `${path}/${i++}` : String(i++);
      walk(child, childPath);
    }
  };
  walk(root, "");
}
/** Written on `<img>` when the browser chose a `srcset`/`<picture>` candidate other than `src`. */
export const CURRENT_SRC_ATTR = "data-h2s-src";

/**
 * @param snap     snapshot as painted (styles incl. transform matrices, paint order)
 * @param boxes    optional snapshot taken with `transform: none` on every element;
 *                 its bounds/offsets are the untransformed layout boxes and win over `snap`'s.
 */
export function snapshotToTree(snap: DomSnapshot, boxes?: DomSnapshot): Raw {
  const doc = snap.documents[0];
  if (!doc) throw new Error("empty snapshot");
  const S = snap.strings;
  const str = (i: number) => (i >= 0 ? S[i]! : "");
  const n = doc.nodes.nodeType.length;
  const raws: Raw[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const attrs: Record<string, string> = {};
    const a = doc.nodes.attributes[i] ?? [];
    for (let k = 0; k + 1 < a.length; k += 2) attrs[str(a[k]!).toLowerCase()] = str(a[k + 1]!);
    raws[i] = {
      idx: i,
      type: doc.nodes.nodeType[i]!,
      name: str(doc.nodes.nodeName[i]!).toLowerCase(),
      value: str(doc.nodes.nodeValue[i]!),
      attrs,
      styles: {},
      children: [],
    };
  }
  for (let i = 0; i < n; i++) {
    const p = doc.nodes.parentIndex[i]!;
    if (p >= 0) {
      raws[p]!.children.push(raws[i]!);
      raws[i]!.parent = raws[p];
    }
  }
  const pseudo = doc.nodes.pseudoType;
  if (pseudo) for (let k = 0; k < pseudo.index.length; k++) raws[pseudo.index[k]!]!.pseudo = str(pseudo.value[k]!);
  const L = doc.layout;
  for (let li = 0; li < L.nodeIndex.length; li++) {
    const r = raws[L.nodeIndex[li]!]!;
    const b = L.bounds[li]!;
    r.bounds = { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! };
    const o = L.offsetRects?.[li];
    if (o) r.offset = { x: o[0]!, y: o[1]!, w: o[2]!, h: o[3]! };
    const sv = L.styles[li] ?? [];
    for (let k = 0; k < STYLE_WHITELIST.length; k++) {
      const v = sv[k];
      if (v !== undefined && v >= 0) r.styles[STYLE_WHITELIST[k]!] = S[v]!;
    }
    const t = L.text[li];
    // Text nodes keep their DOM value (untransformed); generated content only exists as laid-out text.
    if (r.type === 3) r.text = r.value.trim() ? r.value : t !== undefined && t >= 0 ? S[t]! : "";
    else if (r.pseudo) r.text = t !== undefined && t >= 0 ? S[t]! : "";
    if (L.paintOrders) r.paint = L.paintOrders[li];
  }
  const LB = boxes?.documents[0]?.layout;
  if (LB) {
    for (let li = 0; li < LB.nodeIndex.length; li++) {
      const r = raws[LB.nodeIndex[li]!];
      const b = LB.bounds[li];
      if (r && b) r.bounds = { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! };
      const o = LB.offsetRects?.[li];
      if (r && o) r.offset = { x: o[0]!, y: o[1]!, w: o[2]!, h: o[3]! };
    }
  }
  // Line boxes: from the untransformed snapshot when there is one, so a rotated paragraph's
  // lines are its layout lines (transforms never affect line breaking).
  assignLineBoxes(boxes?.documents[0] ?? doc, raws);
  if (pseudo) for (const i of pseudo.index) raws[i]!.box = pseudoBox(raws[i]!);
  const cur = doc.nodes.currentSourceURL;
  if (cur) {
    const base = str(doc.documentURL);
    for (let k = 0; k < cur.index.length; k++) markCurrentSrc(raws[cur.index[k]!]!, str(cur.value[k]!), base);
  }
  const html = raws.find((r) => r.type === 1 && r.name === "html");
  if (!html) throw new Error("no <html> in snapshot");
  return html;
}

/**
 * `textBoxes` → `Raw.lines`. One entry per laid-out inline text box, i.e. per line the browser
 * broke the text node into (a `<br>`-free paragraph of one line has exactly one). `layoutIndex`
 * points into the layout arrays, so the owning text node is `nodes.nodeIndex[layoutIndex]`.
 * `start`/`length` are UTF-16 offsets into the node's laid-out text, which is what makes the
 * browser's line division reproducible downstream.
 */
function assignLineBoxes(document: DomSnapshot["documents"][number], raws: Raw[]): void {
  const tb = document.textBoxes;
  const nodeIndex = document.layout.nodeIndex;
  for (let k = 0; k < tb.layoutIndex.length; k++) {
    const r = raws[nodeIndex[tb.layoutIndex[k]!]!];
    const b = tb.bounds[k];
    if (!r || !b) continue;
    (r.lines ??= []).push({ bounds: { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! }, start: tb.start[k]!, length: tb.length[k]! });
  }
}

/**
 * Border box of a pseudo-element. DOMSnapshot `bounds` for pseudo-elements is
 * the box of their generated text (empty for `content: ""`), so the box is
 * rebuilt from the CSSOM offset rect the way Chromium defines `offsetLeft/Top`:
 * relative to the padding edge of the nearest positioned ancestor (or
 * `table`/`td`/`th` for non-positioned pseudos), to the border-box origin of a
 * positioned `<body>`, or to the document origin for a static `<body>` /
 * `position: fixed`. Undefined when no offset rect or no offsetParent is known.
 * Offset rects are integer (CSSOM `long`), so the box is whole-px; the text
 * child keeps the fractional snapshot bounds.
 */
function pseudoBox(raw: Raw): Rect | undefined {
  const o = raw.offset;
  if (!o) return undefined;
  const position = raw.styles["position"] ?? "static";
  if (position === "fixed") return { ...o };
  for (let a = raw.parent; a; a = a.parent) {
    if (!a.bounds) continue; // display: contents — no layout object, skipped by the layout-tree walk
    const positioned = (a.styles["position"] ?? "static") !== "static";
    if (a.name === "body") return positioned ? { x: a.bounds.x + o.x, y: a.bounds.y + o.y, w: o.w, h: o.h } : { ...o };
    if (positioned || (position === "static" && (a.name === "table" || a.name === "td" || a.name === "th"))) {
      const bl = parseFloat(a.styles["border-left-width"] ?? "") || 0;
      const bt = parseFloat(a.styles["border-top-width"] ?? "") || 0;
      return { x: a.bounds.x + bl + o.x, y: a.bounds.y + bt + o.y, w: o.w, h: o.h };
    }
  }
  return undefined;
}

/**
 * Records the `srcset`/`<picture>` candidate the browser actually loaded as
 * `data-h2s-src`, spelled as authored (so it stays a bundlable path), when it
 * is not the plain `src`. Falls back to the absolute URL if no candidate matches.
 */
function markCurrentSrc(img: Raw, currentSrc: string, base: string): void {
  if (!currentSrc) return;
  const resolve = (u: string) => {
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  const src = img.attrs["src"];
  if (src !== undefined && resolve(src) === currentSrc) return;
  const candidates = srcsetUrls(img.attrs["srcset"] ?? "");
  if (img.parent?.name === "picture") {
    for (const s of img.parent.children) if (s.type === 1 && s.name === "source") candidates.push(...srcsetUrls(s.attrs["srcset"] ?? ""));
  }
  img.attrs[CURRENT_SRC_ATTR] = candidates.find((c) => resolve(c) === currentSrc) ?? currentSrc;
}

/** Candidate URLs of a `srcset` (HTML spec tokenisation: URLs are whitespace-free, descriptors run to the next comma). */
export function srcsetUrls(srcset: string): string[] {
  const out: string[] = [];
  const n = srcset.length;
  let i = 0;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i]!)) i++;
    const start = i;
    while (i < n && !/\s/.test(srcset[i]!)) i++;
    const url = srcset.slice(start, i);
    if (!url) break;
    if (url.endsWith(",")) out.push(url.replace(/,+$/, ""));
    else {
      out.push(url);
      while (i < n && srcset[i] !== ",") i++;
    }
  }
  return out;
}

export function findByAttr(root: Raw, attr: string, value: string): Raw | undefined {
  if (root.attrs[attr] === value) return root;
  for (const c of root.children) {
    const f = findByAttr(c, attr, value);
    if (f) return f;
  }
  return undefined;
}

export function findAll(root: Raw, pred: (r: Raw) => boolean, out: Raw[] = []): Raw[] {
  if (pred(root)) out.push(root);
  for (const c of root.children) findAll(c, pred, out);
  return out;
}

/**
 * Convert the capture root to a LayoutNode tree, dropping nodes without
 * layout (display:none, <script>, comments, collapsed whitespace — a
 * whitespace-only text node that renders as an inter-run space is kept) and
 * rebasing bounds to `origin`. Element ids come from `identity`; `path` is the
 * element-index path of `raw` from the capture root ("" for the root itself,
 * then "0", "0/2", …) counting element children only.
 *
 * - `::before`/`::after`/`::marker` become element nodes with that tag, their
 *   computed styles, the derived border box and one `#text` child holding the
 *   generated text (counters/quotes already resolved by the browser). `::after`
 *   is placed after the element's real children, the others before. They do
 *   not consume an element index; their path is `<parent path>/::before`.
 *   Empty ones (`content: ""` without a box) are dropped.
 * - An element without a layout box but with laid-out children
 *   (`display: contents`) is spliced out: its children join the parent's list
 *   in order; the element's own attrs and id are gone. It still counts as an
 *   element in its children's paths so identity follows the DOM.
 * - `visibility: hidden` elements keep their box and are emitted like any
 *   other node; hiding is the inference pass's decision.
 */
export function toLayout(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, path = ""): LayoutNode | undefined {
  if (raw.type !== 1 || SKIP_TAGS[raw.name]) return undefined;
  if (!raw.bounds && !KEEP_WITHOUT_LAYOUT[raw.name]) return undefined; // display:none or not laid out
  return element(raw, origin, identity, path);
}

function element(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, path: string): LayoutNode {
  const node: LayoutNode = {
    tag: raw.name,
    attrs: raw.attrs,
    styles: raw.styles,
    bounds: raw.bounds ? rebase(raw.bounds, origin) : { x: 0, y: 0, w: 0, h: 0 },
    children: [],
    ...(raw.preferredSize ? { preferredSize: raw.preferredSize } : {}),
  };
  const id = identity(raw.name, raw.attrs, path);
  if (id !== undefined) node.id = id;
  if (raw.paint !== undefined) node.paint = raw.paint;
  appendChildren(raw, origin, identity, path, node.children);
  return node;
}

/** Converts `raw`'s children into `out`; `path` is `raw`'s element path. */
function appendChildren(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, path: string, out: LayoutNode[]): void {
  let after: LayoutNode | undefined;
  let i = 0;
  for (const c of raw.children) {
    if (c.type === 3) {
      // Whitespace-only text survives only when the browser actually laid out a
      // space for it (inter-run gap: w > 0); collapsed whitespace has no box. A
      // `KEEP_WITHOUT_LAYOUT` host (`<option>`) has no box and neither has its label — the
      // laid-out text of the snapshot never covers it, so its DOM value is the text, kept with
      // a zero rect because nothing measures it.
      if (c.bounds && c.text && (c.text.trim() || c.bounds.w > 0)) {
        const text: LayoutNode = { tag: "#text", attrs: {}, styles: {}, bounds: rebase(c.bounds, origin), text: c.text, children: [] };
        // Only a broken text node needs its division recorded; one box is the bounds already.
        if (c.lines && c.lines.length > 1) text.lines = c.lines.map((l) => ({ bounds: rebase(l.bounds, origin), start: l.start, length: l.length }));
        out.push(text);
      } else if (!raw.bounds && c.value.trim()) {
        out.push({ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: c.value, children: [] });
      }
      continue;
    }
    if (c.type !== 1) continue;
    if (c.pseudo !== undefined) {
      const p = pseudoElement(c, origin, identity, path);
      if (!p) continue;
      if (c.pseudo === "after") after = p;
      else out.push(p);
      continue;
    }
    const childPath = path === "" ? `${i++}` : `${path}/${i++}`;
    if (SKIP_TAGS[c.name]) continue;
    if (c.bounds || KEEP_WITHOUT_LAYOUT[c.name]) out.push(element(c, origin, identity, childPath));
    else if (hasLayout(c)) appendChildren(c, origin, identity, childPath, out); // display: contents
    // else display: none — nothing below it is laid out
  }
  if (after) out.push(after);
}

function hasLayout(raw: Raw): boolean {
  return raw.bounds !== undefined || raw.children.some(hasLayout);
}

function pseudoElement(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, parentPath: string): LayoutNode | undefined {
  const tag = PSEUDO_TAGS[raw.pseudo!];
  if (!tag || !raw.bounds) return undefined;
  const text = raw.text?.trim() ? raw.text : undefined;
  const box = raw.box && raw.box.w > 0 && raw.box.h > 0 ? raw.box : undefined;
  if (!text && !box) return undefined;
  const node: LayoutNode = {
    tag,
    attrs: {},
    styles: raw.styles,
    bounds: rebase(box ?? raw.bounds, origin),
    children: text ? [{ tag: "#text", attrs: {}, styles: {}, bounds: rebase(raw.bounds, origin), text, children: [] }] : [],
  };
  const id = identity(tag, node.attrs, parentPath === "" ? tag : `${parentPath}/${tag}`);
  if (id !== undefined) node.id = id;
  if (raw.paint !== undefined) node.paint = raw.paint;
  return node;
}

function rebase(b: Rect, o: { x: number; y: number }): Rect {
  return { x: round(b.x - o.x), y: round(b.y - o.y), w: round(b.w), h: round(b.h) };
}

const round = (v: number) => Math.round(v * 100) / 100;
