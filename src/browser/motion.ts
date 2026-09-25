/** CSS motion facts that must survive a stable, static browser capture. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";

/** Remember effective transitions before the capture harness suppresses interpolation. */
export async function readTransitionProperties(page: Page, selector: string): Promise<Record<string, string>> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const out: Record<string, string> = {};
    const record = (element: Element, path: string, pseudo?: string) => {
      const style = getComputedStyle(element, pseudo);
      if (style.transitionProperty !== "none" && style.transitionDuration.split(",").some(time => parseFloat(time) > 0)) {
        out[path] = style.transitionProperty;
      }
    };
    const walk = (element: Element, path: string): void => {
      record(element, path);
      for (const pseudo of ["::before", "::after", "::marker"]) record(element, `${path}/${pseudo}`, pseudo);
      Array.from(element.children).forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return out;
  }, selector);
}

/** DOMSnapshot saw transition-property:none; restore authored computed values by element path. */
export function restoreTransitionProperties(root: Raw, properties: Record<string, string>): void {
  const walk = (raw: Raw, path: string): void => {
    if (properties[path]) raw.styles["transition-property"] = properties[path]!;
    let index = 0;
    for (const child of raw.children) {
      if (child.type !== 1) continue;
      if (child.pseudo) walk(child, `${path}/::${child.pseudo}`);
      else walk(child, path ? `${path}/${index++}` : String(index++));
    }
  };
  walk(root, "");
}

/** Declarations may be dormant (e.g. `.card.flash`), so report them without blaming a node. */
export async function readKeyframeNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const names = new Set<string>();
    const visited = new Set<CSSStyleSheet>();
    const visitSheet = (sheet: CSSStyleSheet): void => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      try { visitRules(sheet.cssRules); } catch { /* cross-origin stylesheets are opaque */ }
    };
    const visitRules = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if (rule instanceof CSSKeyframesRule) names.add(rule.name);
        else if (rule instanceof CSSImportRule && rule.styleSheet) visitSheet(rule.styleSheet);
        else if ("cssRules" in rule) visitRules((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      if ((sheet.ownerNode as Element | null)?.hasAttribute?.("data-h2s-harness")) continue;
      visitSheet(sheet);
    }
    return [...names];
  });
}
