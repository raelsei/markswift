/** Parse standalone SVG markup into layout data before SVG analysis. */
import { type Rect, type LayoutNode } from "../../model/layout.ts";
import { type SvgNode, type SemBase, addDiagnostic, confidenceOf } from "../../model/semantic.ts";
import { DomHandler, type Element, type Text } from "domhandler";
import { Parser } from "htmlparser2";
import { round2, parseDeclared } from "../../css/index.ts";
import { num } from "./attributes.ts";
import { buildSvg } from "./build.ts";

/**
 * Standalone SVG markup (a `data:image/svg+xml` URL, an inline asset) → SvgNode drawn in
 * `frame`. Attributes only — there is no computed style — so `currentColor`, CSS classes
 * and `<style>` rules inside the markup are not resolved. Undefined when the root is not an
 * `<svg>` or no viewBox can be derived (neither `viewBox` nor width/height).
 */
export function svgFromMarkup(markup: string, frame: Rect): SvgNode | undefined {
  const rootEl = parseSvgRoot(markup);
  return rootEl && svgFromElement(rootEl, frame);
}

/**
 * A `data:image/svg+xml` URL → its vector (drawn in a zero frame; the emitter sizes it) and CSS
 * natural size; `undefined` for any other URL. The payload is parsed once for both. The natural
 * size is px `width`/`height`; one of them alone takes the other from the viewBox ratio. With
 * neither (or `%`) the image has a ratio but no size: the caller fits the viewBox into its area.
 */
export function svgFromDataUrl(url: string): { vector?: SvgNode; intrinsic?: { w: number; h: number } } | undefined {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data || data[1] !== "image/svg+xml") return undefined;
  const [, , params = "", payload = ""] = data;
  const rootEl = parseSvgRoot(
    params.split(";").includes("base64")
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload),
  );
  if (!rootEl) return {};
  const out: { vector?: SvgNode; intrinsic?: { w: number; h: number } } = {};
  const px = (v: string | undefined) => (v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : undefined);
  const w = px(rootEl.attribs["width"]),
    h = px(rootEl.attribs["height"]);
  const vb = rootEl.attribs["viewbox"]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const ratio = vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0 ? vb[2]! / vb[3]! : undefined;
  if (w && h) out.intrinsic = { w, h };
  else if (w && ratio) out.intrinsic = { w, h: w / ratio };
  else if (h && ratio) out.intrinsic = { w: h * ratio, h };
  const vector = svgFromElement(rootEl, { x: 0, y: 0, w: 0, h: 0 });
  if (vector) out.vector = vector;
  return out;
}

function parseSvgRoot(markup: string): Element | undefined {
  const handler = new DomHandler();
  new Parser(handler, { xmlMode: true, lowerCaseTags: true, lowerCaseAttributeNames: true }).end(markup);
  return handler.dom.find((n): n is Element => n.type === "tag" && n.name === "svg");
}

function svgFromElement(rootEl: Element, frame: Rect): SvgNode | undefined {
  // An inline `style` beats a presentation attribute; merged into `attrs`, it inherits like one.
  const toLayout = (el: Element): LayoutNode => ({
    tag: el.name,
    attrs: { ...el.attribs, ...parseDeclared(el.attribs["style"]) },
    styles: {},
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    children: el.children.flatMap((c) =>
      c.type === "tag"
        ? [toLayout(c as Element)]
        : c.type === "text"
          ? [
              {
                tag: "#text",
                attrs: {},
                styles: {},
                bounds: { x: 0, y: 0, w: 0, h: 0 },
                text: (c as Text).data,
                children: [],
              },
            ]
          : [],
    ),
  });
  const root = toLayout(rootEl);
  // No computed style here: seed the SVG initial fill so unfilled shapes paint black, as in the browser.
  root.attrs = { fill: "black", ...root.attrs };
  if (!root.attrs["viewbox"]) {
    const w = num(root.attrs["width"]),
      h = num(root.attrs["height"]);
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
    diagnostics: [],
    overlays: [],
  };
  const node = buildSvg(root, base);
  const styled = (el: LayoutNode): boolean =>
    el.tag === "style" || el.attrs["class"] !== undefined || el.children.some(styled);
  if (styled(root))
    addDiagnostic(
      node.diagnostics,
      "unmapped",
      "style",
      "svg <style> rules and class selectors are not applied (markup has no computed style)",
    );
  node.confidence = confidenceOf(node.diagnostics);
  return node;
}
