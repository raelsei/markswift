/** Name hints from an element's own markup: what generated Swift names (components, fields) may use. */
import type { SemBase } from "../model/semantic.ts";

/** Tailwind-style utility classes say how an element looks, not what it is. */
const UTILITY =
  /[:[\]/.]|\d|^-?(flex|grid|block|inline|hidden|items|justify|self|place|content|gap|space|p[trblxyse]?|m[trblxyse]?|w|h|min|max|size|text|font|leading|tracking|bg|border|rounded|shadow|ring|outline|opacity|overflow|truncate|whitespace|break|z|top|left|right|bottom|inset|absolute|relative|fixed|sticky|shrink|grow|basis|order|col|row|transition|duration|ease|cursor|select|pointer|sr|not|group|peer|dark|uppercase|lowercase|capitalize|italic|underline|line|antialiased|object|aspect|fill|stroke|accent|caret|divide|from|via|to|last|first)(-|$)/;

const TAG_NOUNS: Readonly<Record<string, string>> = {
  li: "Row",
  tr: "Row",
  article: "Card",
  section: "Section",
  header: "Header",
  footer: "Footer",
  nav: "Nav",
  form: "Form",
  button: "Button",
  a: "Link",
  ul: "List",
  ol: "List",
  label: "Field",
  figure: "Figure",
  aside: "Aside",
};
const ROLE_NOUNS: Readonly<Record<string, string>> = { listitem: "Row", row: "Row" };

/** First of `data-markswift-component`, `id`, `data-slot`, `aria-label`, first non-utility class, tag noun. */
export function nameHintOf(tag: string, attrs: Record<string, string>): SemBase["nameHint"] {
  const own = (
    [
      ["component", attrs["data-markswift-component"]],
      ["id", attrs["id"]],
      ["slot", attrs["data-slot"]],
      ["aria", attrs["aria-label"]],
      ["class", attrs["class"]?.split(/\s+/).find((c) => c && !UTILITY.test(c))],
    ] as const
  ).find(([, v]) => v?.trim());
  if (own) return { words: own[1]!.trim(), source: own[0] };
  const role = attrs["role"]?.trim().toLowerCase() ?? "";
  return { words: ROLE_NOUNS[role] ?? TAG_NOUNS[tag.toLowerCase()] ?? "Item", source: "tag" };
}

/** Trimmed `data-markswift-field`; undefined when absent or empty. */
export function fieldOf(attrs: Record<string, string>): string | undefined {
  return attrs["data-markswift-field"]?.trim() || undefined;
}
