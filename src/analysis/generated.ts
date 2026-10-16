/** Generated content (`::before`/`::after`/`::marker`): inline images, counters, alt text, undrawn images. */
import { type LayoutNode } from "../model/layout.ts";
import { type CounterStyle, type TextRun } from "../model/semantic.ts";
import { COUNTER_STYLES, contentAlt, cssUrls, parseCounter } from "../css/index.ts";

/** Content-bearing pseudo-elements (not `::backdrop` and other boxes without `content`). */
export const PSEUDO: Readonly<Record<string, true>> = { "::before": true, "::after": true, "::marker": true };

/** An `img` child of a pseudo whose bytes were captured (`data:`): it rides in the pseudo's text as an image run. */
export function inlineImage(parent: LayoutNode, k: LayoutNode): boolean {
  return k.tag === "img" && PSEUDO[parent.tag] === true && (k.currentSrc ?? k.attrs["src"] ?? "").startsWith("data:");
}

/** The alt text of a pseudo's generated image: `content: url(…) / "alt"`, else `""` (decorative); undefined off a pseudo. */
export function generatedAlt(p: LayoutNode | undefined): string | undefined {
  return p && PSEUDO[p.tag] ? (contentAlt(p.styles["content"]) ?? "") : undefined;
}

/** A pseudo that names more `url()` images than the browser laid out: the diagnostic reporting the loss. */
export function undrawnImages(p: LayoutNode): { feature: "content" | "list-style-image"; message: string } | undefined {
  const content = p.styles["content"];
  let feature: "content" | "list-style-image" = "content";
  // The alt strings after ` / ` hold no urls, so every url() is an image.
  let asked = cssUrls(content).length;
  if (!asked && p.tag === "::marker" && (content ?? "normal") === "normal") {
    feature = "list-style-image";
    asked = cssUrls(p.styles["list-style-image"]).length;
  }
  const drawn = p.children.filter((k) => k.tag === "img").length;
  if (asked <= drawn) return undefined;
  return {
    feature,
    message: `${p.tag} asks for ${asked} url() image(s); Chrome laid out ${drawn} (a source that did not load draws nothing in the browser either)`,
  };
}

const COUNTER_CONTENT =
  /^(?:"((?:[^"\\]|\\.)*)"\s+)?counter\(\s*[-\w]+\s*(?:,\s*([-\w]+)\s*)?\)(?:\s+"((?:[^"\\]|\\.)*)")?$/;

/** The counter a pseudo printed as `text` (a counter `list-style-type` marker, `content: counter()`), if regenerable. */
export function counterOf(el: LayoutNode, text: string): TextRun["counter"] {
  const content = el.styles["content"];
  let style: CounterStyle;
  let prefix = "";
  let suffix: string | undefined;
  if (el.tag === "::marker" && (content ?? "normal") === "normal") {
    const s = COUNTER_STYLES[el.styles["list-style-type"] ?? ""];
    if (!s) return undefined;
    style = s;
  } else if (el.tag === "::before" || el.tag === "::after") {
    const m = COUNTER_CONTENT.exec(content ?? "");
    const s = m && COUNTER_STYLES[m[2] ?? "decimal"];
    if (!s) return undefined;
    style = s;
    prefix = (m[1] ?? "").replace(/\\(.)/g, "$1");
    suffix = (m[3] ?? "").replace(/\\(.)/g, "$1");
  } else return undefined;
  const parsed = parseCounter(text, style, prefix);
  if (!parsed || (suffix !== undefined && parsed.suffix !== suffix)) return undefined;
  return { style, value: parsed.value, prefix, suffix: parsed.suffix };
}
