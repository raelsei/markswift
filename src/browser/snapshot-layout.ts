import type { LayoutNode } from "../model/layout.ts";
import type { NodeIdentity } from "../input/types.ts";
import type { PreferredSizes } from "./sizing.ts";
import type { Raw } from "./snapshot-types.ts";
import { rebase } from "./snapshot-geometry.ts";
import { singleGeneratedImageUrl } from "./generated-content.ts";

const SKIP_TAGS: Record<string, true> = { script: true, style: true, link: true, meta: true, template: true, noscript: true };
/**
 * Nodes that never get a layout box but must survive: SVG paint servers, so fills/strokes can
 * resolve `url(#id)`, and `<option>`/`<optgroup>`, which Chrome lays out in the select popup
 * rather than in the page. Listbox rows can be measured; popup choices retain their text.
 * Boxless `<col>`/`<colgroup>` retain declared width intent and column paint.
 */
const KEEP_WITHOUT_LAYOUT: Record<string, true> = { defs: true, lineargradient: true, radialgradient: true, stop: true, clippath: true, mask: true, option: true, optgroup: true, col: true, colgroup: true };
/** Pseudo-elements that become LayoutNodes; every other `pseudoType` (first-letter, backdrop, scrollbar parts, …) is dropped. */
const PSEUDO_TAGS: Record<string, string> = { before: "::before", after: "::after", marker: "::marker" };

/** Join CSS size intent while wrappers still exist, before display:contents is flattened. */
export function attachPreferredSizes(root: Raw, sizes: PreferredSizes): void {
  const walk = (raw: Raw, path: string) => {
    if (Object.hasOwn(sizes, path)) {
      const { columnStyles, ...preferredSize } = sizes[path]!;
      raw.preferredSize = preferredSize;
      if (columnStyles && (raw.name === "col" || raw.name === "colgroup")) raw.styles = { ...raw.styles, ...columnStyles };
    }
    if (raw.children.some(child => child.shadowRootType === "closed" || child.shadowRootType === "user-agent")) return;
    let i = 0;
    for (const child of raw.children) {
      if (child.type !== 1 || child.pseudo !== undefined) continue;
      const childPath = path ? `${path}/${i++}` : String(i++);
      walk(child, childPath);
    }
  };
  walk(root, "");
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
 *   generated text (counters/quotes already resolved by the browser), or one
 *   measured image child for a lone `content: url(...)`. `::after`
 *   is placed after the element's real children, the others before. They do
 *   not consume an element index; their path is `<parent path>/::before`.
 *   Empty ones (`content: ""` without a box) are dropped.
 * - An element without a layout box but with laid-out children
 *   (`display: contents`) is spliced out: its children join the parent's list
 *   in order; a custom wrapper's tag/id is recorded on the nearest measured
 *   ancestor for diagnostics. It still counts as an element in its children's
 *   paths so identity follows the DOM.
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
    ...(raw.formOwner !== undefined ? { formOwner: raw.formOwner } : {}),
    ...(raw.selectedIndex !== undefined ? { selectedIndex: raw.selectedIndex } : {}),
    ...(raw.option !== undefined ? { option: raw.option } : {}),
  };
  const id = identity(raw.name, raw.attrs, path);
  if (id !== undefined) node.id = id;
  if (raw.paint !== undefined) node.paint = raw.paint;
  appendChildren(raw, origin, identity, path, node.children, node);
  return node;
}

/** Converts `raw`'s children into `out`; `path` is `raw`'s element path. */
function appendChildren(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, path: string, out: LayoutNode[], host: LayoutNode): void {
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
        if (c.firstBaseline !== undefined) text.firstBaseline = Math.round((c.firstBaseline - origin.y) * 100) / 100;
        if (c.lines && c.lines.length > 1) text.lines = c.lines.map((l) => ({ bounds: rebase(l.bounds, origin), start: l.start, length: l.length,
          ...(l.baseline !== undefined ? { baseline: Math.round((l.baseline - origin.y) * 100) / 100 } : {}) }));
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
    else if (hasLayout(c) || ((host.tag === "select" || host.tag === "optgroup") && hasOption(c))) {
      // `display: contents` has no box to emit. Keep its custom semantics on the nearest
      // surviving host instead of inserting a synthetic wrapper that would alter flow.
      if (c.name.includes("-")) (host.flattenedCustomElements ??= []).push({ tag: c.name, ...(c.attrs.id ? { id: c.attrs.id } : {}) });
      appendChildren(c, origin, identity, childPath, out, host);
    }
    // else display: none — nothing below it is laid out
  }
  if (after) out.push(after);
}

function hasLayout(raw: Raw): boolean {
  return raw.bounds !== undefined || raw.children.some(hasLayout);
}

/** Modern selects may wrap popup options in boxless divs; retain their choices, not their boxes. */
function hasOption(raw: Raw): boolean {
  if (raw.name === "option") return true;
  if (SKIP_TAGS[raw.name] || ["select", "datalist", "hr"].includes(raw.name)) return false;
  return raw.children.some(hasOption);
}

function pseudoElement(raw: Raw, origin: { x: number; y: number }, identity: NodeIdentity, parentPath: string): LayoutNode | undefined {
  const tag = PSEUDO_TAGS[raw.pseudo!];
  if (!tag || !raw.bounds) return undefined;
  const text = raw.text?.trim() ? raw.text : undefined;
  const box = raw.box && raw.box.w > 0 && raw.box.h > 0 ? raw.box : undefined;
  if (!text && !box) return undefined;
  const imageUrl = box ? singleGeneratedImageUrl(raw.styles.content ?? "") : undefined;
  const bounds = rebase(box ?? raw.bounds, origin);
  const imageBounds = imageUrl && box ? rebase(pseudoContentBox(box, raw.styles), origin) : undefined;
  const node: LayoutNode = {
    tag,
    attrs: {},
    styles: raw.styles,
    bounds,
    ...(raw.markerLayout ? { markerLayout: { ...raw.markerLayout, pixelOffset: { x: origin.x - Math.floor(origin.x), y: origin.y - Math.floor(origin.y) } } } : {}),
    children: imageUrl && imageBounds
      ? [{ tag: "img", attrs: { src: imageUrl, alt: "" }, styles: { display: "block", "object-fit": "fill" }, bounds: imageBounds, children: [] }]
      : text ? [{ tag: "#text", attrs: {}, styles: {}, bounds: rebase(raw.bounds, origin), text, children: [] }] : [],
  };
  const id = identity(tag, node.attrs, parentPath === "" ? tag : `${parentPath}/${tag}`);
  if (id !== undefined) node.id = id;
  if (raw.paint !== undefined) node.paint = raw.paint;
  return node;
}

/** The pseudo owns padding and border paint; its replaced image occupies only the content box. */
function pseudoContentBox(box: LayoutNode["bounds"], styles: Record<string, string>): LayoutNode["bounds"] {
  const inset = (edge: "top" | "right" | "bottom" | "left") => {
    const padding = parseFloat(styles[`padding-${edge}`] ?? "") || 0;
    const borderStyle = styles[`border-${edge}-style`];
    const border = borderStyle && borderStyle !== "none" && borderStyle !== "hidden"
      ? parseFloat(styles[`border-${edge}-width`] ?? "") || 0 : 0;
    return padding + border;
  };
  const top = inset("top"), right = inset("right"), bottom = inset("bottom"), left = inset("left");
  return { x: box.x + left, y: box.y + top, w: Math.max(0, box.w - left - right), h: Math.max(0, box.h - top - bottom) };
}
