/** Parse standalone SVG markup into layout data before SVG analysis. */
import { type Rect, type LayoutNode } from "../../model/layout.ts";
import { type SvgNode, type SemBase } from "../../model/semantic.ts";
import { DomHandler, type Element, type Text } from "domhandler";
import { Parser } from "htmlparser2";
import { round2 } from "../../css/index.ts";
import { num } from "./attributes.ts";
import { buildSvg } from "./build.ts";

/**
 * Standalone SVG markup (a `data:image/svg+xml` URL, an inline asset) → SvgNode drawn in
 * `frame`. Attributes only — there is no computed style — so `currentColor`, CSS classes
 * and `<style>` rules inside the markup are not resolved. Undefined when the root is not an
 * `<svg>` or no viewBox can be derived (neither `viewBox` nor width/height).
 */
export function svgFromMarkup(markup: string, frame: Rect): SvgNode | undefined {
  const handler = new DomHandler();
  new Parser(handler, { xmlMode: true, lowerCaseTags: true, lowerCaseAttributeNames: true }).end(markup);
  const rootEl = handler.dom.find((n): n is Element => n.type === "tag" && n.name === "svg");
  if (!rootEl) return undefined;
  const toLayout = (el: Element): LayoutNode => ({
    tag: el.name,
    attrs: el.attribs,
    styles: {},
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    children: el.children.flatMap((c) => (c.type === "tag" ? [toLayout(c as Element)] : c.type === "text" ? [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 0, h: 0 }, text: (c as Text).data, children: [] }] : [])),
  });
  const root = toLayout(rootEl);
  if (!root.attrs["viewbox"]) {
    const w = num(root.attrs["width"]), h = num(root.attrs["height"]);
    if (w <= 0 || h <= 0) return undefined;
    root.attrs["viewbox"] = `0 0 ${w} ${h}`;
  }
  root.bounds = frame;
  const base: SemBase = {
    id: "svg-markup",
    frame,
    width: { kind: "fixed", px: round2(frame.w) },
    height: { kind: "fixed", px: round2(frame.h) },
    padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] },
    confidence: "mapped",
    notes: [],
    overlays: [],
  };
  const node = buildSvg(root, base);
  if (node.notes.some((s) => s.startsWith("unmapped"))) node.confidence = "unmapped";
  else if (node.notes.some((s) => s.startsWith("approximated"))) node.confidence = "approximated";
  return node;
}
