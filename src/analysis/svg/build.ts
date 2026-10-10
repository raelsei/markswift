/** Build semantic SVG nodes from measured layout trees. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SemBase, type SvgNode } from "../../model/semantic.ts";
import { type BundledFamilies } from "../../model/fonts.ts";
import { round2 } from "../../css/index.ts";
import { type SvgContext } from "./context.ts";
import { visitChildren } from "./traversal.ts";
import { inherit } from "./attributes.ts";
import { IDENTITY } from "./transforms.ts";
import { textContent } from "../text-runs.ts";

/** Build the SvgNode for `n` on top of an already-measured `base` (frame, style, padding). `doc` is the document root used to resolve `#id` references. */
export function buildSvg(n: LayoutNode, base: SemBase, doc: LayoutNode = n, bundledFamilies: BundledFamilies = {}): SvgNode {
  const vb = (n.attrs["viewbox"] ?? `0 0 ${n.bounds.w} ${n.bounds.h}`).split(/[\s,]+/).map(Number) as [number, number, number, number];
  const ctx: SvgContext = { bundledFamilies, ids: idIndex(doc), diagnostics: base.diagnostics, vb, frame: n.bounds, paths: [], texts: [] };
  visitChildren(n, { attrs: inherit({}, n.attrs), ctm: IDENTITY, opacity: 1, depth: 0 }, ctx);
  base.width = { kind: "fixed", px: round2(n.bounds.w) };
  base.height = { kind: "fixed", px: round2(n.bounds.h) };
  const node: SvgNode = { ...base, kind: "svg", viewBox: vb, paths: ctx.paths };
  if (ctx.texts.length) node.texts = ctx.texts;
  const title = textContent(n.children.find((c) => c.tag === "title")).trim();
  if (title) node.label = title;
  if (n.attrs["preserveaspectratio"]?.trim().startsWith("none")) node.stretch = true;
  return node;
}

const ID_INDEX = new WeakMap<LayoutNode, Record<string, LayoutNode>>();

/** `id` → element for the whole document, built once per root. */
function idIndex(doc: LayoutNode): Record<string, LayoutNode> {
  let index = ID_INDEX.get(doc);
  if (index) return index;
  index = {};
  const walk = (el: LayoutNode) => {
    const id = el.attrs["id"];
    if (id && !index![id]) index![id] = el;
    for (const c of el.children) walk(c);
  };
  walk(doc);
  ID_INDEX.set(doc, index);
  return index;
}
