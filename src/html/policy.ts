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
  if (tag === "a" && attrs["href"] !== undefined)
    return { route: "control", support: "implemented", atomic: false, known: true };
  // The static design shows a video's poster frame and an image button's picture: both draw as an Image.
  const video = tag === "video" && !!attrs["poster"]?.trim();
  if (video || (tag === "input" && attrs["type"]?.toLowerCase() === "image"))
    return {
      route: "image",
      support: "approximated",
      atomic: true,
      known: true,
      diagnostic: video
        ? {
            level: "approximated",
            feature: "video",
            message: "<video poster> → static poster image; playback and controls are not translated",
          }
        : {
            level: "approximated",
            feature: "input: image",
            message: '<input type="image"> → static image of its src; the submit action is not translated',
          },
    };
  if (tag === "input") {
    const type = (attrs["type"] ?? "text").toLowerCase();
    const why = Object.hasOwn(INPUT_PLACEHOLDERS, type) ? INPUT_PLACEHOLDERS[type] : undefined;
    if (why)
      return {
        route: "placeholder",
        support: "unsupported",
        atomic: true,
        known: true,
        diagnostic: { level: "unmapped", feature: `input: ${type}`, message: `<input type="${type}"> ${why}` },
      };
  }
  if (Object.hasOwn(HTML_ELEMENTS, tag)) return HTML_ELEMENTS[tag]!;
  return {
    route: "flow",
    support: "approximated",
    atomic: true,
    known: false,
    diagnostic: {
      level: "approximated",
      feature: "custom-element",
      message: `<${tag}> ${tag.includes("-") ? "custom element" : "unclassified element"} → measured content; custom semantics and behavior are not translated`,
    },
  };
}
