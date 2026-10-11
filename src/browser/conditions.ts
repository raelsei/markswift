/** CSS the capture resolved for one viewport and one validation state, reported instead of silently baked in. */
import type { Page } from "playwright-core";
import { VALIDATION_MARK } from "../model/layout.ts";
import type { ConversionWarning } from "../model/semantic.ts";

/**
 * Walks every readable stylesheet (nested rules included). For `@media`/`@container` rules with a
 * size condition, collects the selectors inside that match the captured root or its descendants
 * (whether or not the condition holds now); marks elements an author rule styles through
 * `:valid`/`:invalid` with VALIDATION_MARK. Call before DOMSnapshot A so the mark lands in `attrs`.
 */
export async function readConditionalRules(
  page: Page,
  selector: string,
  viewportWidth: number,
): Promise<ConversionWarning[]> {
  const found = await page.evaluate(
    ({ selector, mark }) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      const SIZE = /\b(width|height|aspect-ratio|orientation|inline-size|block-size)\b/;
      const VALIDATION = /:(user-)?(in)?valid\b/;
      const PSEUDO_ELEMENT =
        /::?(before|after|marker|placeholder|selection|first-line|first-letter|backdrop|file-selector-button)\b/g;
      const hits = (sel: string) => {
        const plain = sel.replace(PSEUDO_ELEMENT, "");
        try {
          return root.matches(plain) || root.querySelector(plain) !== null;
        } catch {
          return false;
        }
      };
      const conditions = new Map<string, Set<string>>();
      const walk = (rules: CSSRuleList, parent: string | undefined, condition: string | undefined) => {
        for (const rule of Array.from(rules)) {
          let sel = parent;
          let cond = condition;
          if (rule instanceof CSSStyleRule) {
            // Nested rules: `&` is the parent; a nested selector without `&` is relative to it.
            sel =
              parent === undefined
                ? rule.selectorText
                : rule.selectorText.includes("&")
                  ? rule.selectorText.replaceAll("&", `:is(${parent})`)
                  : `:is(${parent}) ${rule.selectorText}`;
            if (cond && hits(sel)) conditions.get(cond)!.add(rule.selectorText);
            if (VALIDATION.test(sel))
              for (const el of [root, ...root.querySelectorAll("*")])
                try {
                  if (el.matches(sel)) el.setAttribute(mark, "");
                } catch {
                  /* unsupported selector */
                }
          } else if (
            (rule instanceof CSSMediaRule || rule instanceof CSSContainerRule) &&
            SIZE.test(rule.conditionText)
          ) {
            cond = `${rule instanceof CSSMediaRule ? "@media" : "@container"} ${rule.conditionText}`;
            if (!conditions.has(cond)) conditions.set(cond, new Set());
            // Tailwind v4 nests the query inside the utility's own rule.
            if (parent && hits(parent)) conditions.get(cond)!.add(parent);
          }
          if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, sel, cond);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules, undefined, undefined);
        } catch {
          /* cross-origin: unreadable, already reported */
        }
      }
      return [...conditions].map(([condition, sels]) => ({ condition, selectors: [...sels] }));
    },
    { selector, mark: VALIDATION_MARK },
  );
  return found
    .filter((c) => c.selectors.length)
    .map(({ condition, selectors }) => ({
      source: "capture" as const,
      level: "approximated" as const,
      feature: condition.startsWith("@container") ? "container-query" : "media-query",
      message: `${condition} restyles ${selectors.length} rule(s) matching captured elements (${selectors.slice(0, 5).join(", ")}${selectors.length > 5 ? ", …" : ""}); the view keeps the layout captured at a ${viewportWidth}px viewport and does not switch`,
    }));
}
