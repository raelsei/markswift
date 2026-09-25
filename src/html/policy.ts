import { HTML_ELEMENTS } from "./elements.ts";
import { INPUT_PLACEHOLDERS } from "./inputs.ts";
import type { ElementPolicy } from "./types.ts";

/** Pure attribute-based classification, also used before the analyzer merges inline text. */
export function classifyElement(tag: string, attrs: Record<string, string> = {}): ElementPolicy {
  if (tag === "#text" || tag === "::before" || tag === "::after" || tag === "::marker") {
    return { route: "text", support: "implemented", atomic: false, known: true };
  }
  // Prose links must remain inline runs: their union box can span several lines, so treating
  // it as an atomic flow control reorders text. buildText reports the dropped destination.
  // Block/inline-block links (and selected anchor roots) still reach the native control path.
  if (tag === "a" && attrs["href"] !== undefined) return { route: "control", support: "implemented", atomic: false, known: true };
  // <area> has no rendered box and cannot reach the layout tree. Report its missing hit
  // regions on the visible image so a conversion does not imply the map still works.
  if (tag === "img" && attrs["usemap"] !== undefined) return {
    route: "image", support: "approximated", atomic: true, known: true,
    note: "approximated: <img usemap> image-map hit regions and navigation are not translated",
  };
  if (tag === "input") {
    const type = (attrs["type"] ?? "text").toLowerCase();
    const why = Object.hasOwn(INPUT_PLACEHOLDERS, type) ? INPUT_PLACEHOLDERS[type] : undefined;
    if (why) return { route: "placeholder", support: "unsupported", atomic: true, known: true, note: `unmapped: <input type="${type}"> ${why}` };
  }
  if (Object.hasOwn(HTML_ELEMENTS, tag)) return HTML_ELEMENTS[tag]!;
  return {
    route: "flow", support: "approximated", atomic: true, known: false,
    note: `approximated: <${tag}> ${tag.includes("-") ? "custom element" : "unclassified element"} → measured content; custom semantics and behavior are not translated`,
  };
}
