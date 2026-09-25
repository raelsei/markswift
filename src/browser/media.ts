/** Media queries are browser-resolved at capture time, not reconstructed in SwiftUI. */
import type { Page } from "playwright-core";

/** Read accessible CSSOM, including imported sheets and media rules inside grouping rules. */
export async function readMediaConditions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const conditions = new Set<string>();
    const visited = new Set<CSSStyleSheet>();
    const add = (text: string) => {
      const condition = text.replace(/\s+/g, " ").trim();
      if (condition && condition !== "all") conditions.add(condition);
    };
    const visitSheet = (sheet: CSSStyleSheet): void => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      try { visitRules(sheet.cssRules); } catch { /* cross-origin CSSOM is opaque */ }
    };
    const visitRules = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) add(rule.conditionText);
        if (rule instanceof CSSImportRule) {
          add(rule.media.mediaText);
          if (rule.styleSheet) visitSheet(rule.styleSheet);
        } else if ("cssRules" in rule) visitRules((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      if ((sheet.ownerNode as Element | null)?.hasAttribute?.("data-h2s-harness")) continue;
      visitSheet(sheet);
    }
    return [...conditions];
  });
}

/** One bounded warning keeps long compiled CSS from overwhelming conversion results. */
export function mediaWarning(conditions: readonly string[]): string | undefined {
  if (!conditions.length) return undefined;
  const shown = conditions.slice(0, 5).map(condition => condition.length > 100 ? `${condition.slice(0, 97)}…` : condition);
  const remaining = conditions.length - shown.length;
  return `CSS @media conditions ${shown.join("; ")}${remaining ? `; +${remaining} more` : ""} were captured at one viewport/theme; the generated Swift view freezes this media-query state.`;
}
