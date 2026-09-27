import type { ElementPolicy, ElementRoute, ElementSupport } from "./types.ts";

function family(tags: string, route: ElementRoute, support: ElementSupport = "implemented", limitation?: string): Record<string, ElementPolicy> {
  return Object.fromEntries(tags.split(" ").map((tag) => [tag, Object.freeze({
    route, support, known: true,
    atomic: !!limitation || ["control", "image", "svg", "placeholder", "metadata"].includes(route),
    ...(limitation ? { note: `${support === "unsupported" ? "unmapped" : "approximated"}: <${tag}> ${limitation}` } : {}),
  })]));
}

/** WHATWG element index, checked 2026-09-16, including SVG and MathML entry points.
 * https://html.spec.whatwg.org/multipage/indices.html
 * Browser-computed display/geometry decides layout; these policies decide exceptional semantics.
 * "implemented" means a compiler path exists. CSS combinations, accessibility and behavior
 * require their own tests and are not established by this registry.
 */
export const HTML_ELEMENTS: Readonly<Record<string, ElementPolicy>> = Object.freeze({
  ...family("address article aside blockquote body caption dd div dl dt fieldset figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr html legend li main menu nav ol p picture pre search section summary ul", "flow"),
  ...family("a abbr b bdi bdo cite code data del dfn em i ins kbd mark noscript optgroup option output q rp s samp small span strong sub sup time u var wbr", "text"),
  ...family("button details input meter progress select textarea", "control"),
  ...family("img", "image"),
  ...family("svg", "svg"),
  ...family("br", "line-break"),
  ...family("area base datalist head link meta script source style template title track", "metadata", "nonvisual"),
  ...family("table tbody td tfoot th thead tr col colgroup", "flow", "approximated", "→ measured rows/cells; proven fixed columns and cell spans resize natively; intrinsic allocation, complete border conflicts and browser table navigation remain approximated"),
  ...family("ruby rt", "flow", "approximated", "→ measured annotation boxes; ruby associations and paragraph reflow are not translated"),
  ...family("form", "flow", "approximated", "→ measured content; browser form submission and validation are not translated"),
  ...family("label", "text", "approximated", "→ styled text; label-to-control focus behavior is not translated"),
  ...family("dialog", "flow", "approximated", "→ captured visibility; modal presentation and lifecycle are not translated"),
  ...family("map", "flow", "approximated", "→ measured content; image-map hit regions and navigation are not translated"),
  ...family("slot selectedcontent", "flow", "approximated", "→ captured content; live slot distribution or selected-content updates are not translated"),
  ...family("canvas", "placeholder", "unsupported", "script-drawn bitmap is not translated; placeholder box only"),
  ...family("iframe", "placeholder", "unsupported", "nested document is outside the capture root; placeholder box only"),
  ...family("embed object", "placeholder", "unsupported", "embedded resource is not translated; measured box and any captured object fallback only"),
  ...family("audio video", "placeholder", "unsupported", "media content, browser player controls and playback are not translated; placeholder box only"),
  ...family("math", "placeholder", "unsupported", "MathML notation requires a dedicated renderer; placeholder box only"),
});
