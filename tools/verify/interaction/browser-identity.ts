import type { Page } from "playwright-core";

/** Resolve original DOM identity without annotations, compiler IR or fixture mutations. */
export async function browserControlSelectors(page: Page, rootSelector: string): Promise<Record<string, string>> {
  return page.evaluate(rootSelector => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error("Browser oracle root is missing");
    const selectors: Record<string, string> = {};
    const walk = (element: Element, path: string, selector: string) => {
      const id = element.id ? `#${element.id}` : element.getAttribute("data-markswift") ?? element.getAttribute("data-h2s")
        ?? element.getAttribute("data-testid") ?? element.getAttribute("data-name") ?? (path || "root");
      if (element.matches("input,textarea,select,option,details,summary")) {
        if (selectors[id]) throw new Error(`Ambiguous original browser control identity: ${id}`);
        selectors[id] = selector;
      }
      if (element instanceof HTMLDetailsElement) {
        const content = Array.from(element.children).find(child => child.tagName !== "SUMMARY");
        if (content) selectors[`${id}/content`] = `${selector} > :nth-child(${Array.from(element.children).indexOf(content) + 1})`;
      }
      if (element instanceof HTMLSelectElement) Array.from(element.options).forEach((option, ordinal) => {
        const parts: string[] = [];
        let descendant: Element = option;
        while (descendant !== element) {
          const parent = descendant.parentElement!;
          parts.unshift(`:nth-child(${Array.from(parent.children).indexOf(descendant) + 1})`);
          descendant = parent;
        }
        selectors[`${id}/option/${ordinal}`] = selector + " > " + parts.join(" > ");
      });
      Array.from(element.children).forEach((child, index) => walk(child, path ? `${path}/${index}` : String(index), `${selector} > :nth-child(${index + 1})`));
    };
    walk(root, "", rootSelector);
    return selectors;
  }, rootSelector);
}
