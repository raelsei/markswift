/** Read cascaded sizing without mutating the page or trying to parse framework stylesheets. */
import type { Page } from "playwright-core";
import { STYLE_WHITELIST, type PreferredSize } from "../model/layout.ts";

/** Boxless table columns still supply cascade and paint, even without snapshot layout styles. */
export type PreferredSizes = Record<string, PreferredSize & { columnStyles?: Record<string, string> }>;

/** DOM element paths match snapshot traversal; text and generated pseudo-elements do not count. */
export async function readPreferredSizes(page: Page, selector: string): Promise<PreferredSizes> {
  return page.evaluate(({ selector, properties }) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const out: Record<string, { width: string; height: string; flexBasis?: string; hasAutoMargins?: boolean; gridTemplateColumns?: string; gridTemplateRows?: string; gridAutoRows?: string; columnStyles?: Record<string, string> }> = {};
    const walk = (el: Element, path: string) => {
      const typed = el as Element & { computedStyleMap?: () => { get(property: string): { toString(): string } | undefined } };
      const map = typed.computedStyleMap?.();
      const width = map?.get("width")?.toString();
      const height = map?.get("height")?.toString();
      if (width !== undefined && height !== undefined) {
        const size: typeof out[string] = { width, height };
        if (el.localName === "col" || el.localName === "colgroup") {
          const style = getComputedStyle(el);
          size.columnStyles = Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
        }
        const basis = map?.get("flex-basis")?.toString();
        if (basis !== undefined && basis !== "auto") size.flexBasis = basis;
        if (["top", "right", "bottom", "left"].some(edge => map?.get(`margin-${edge}`)?.toString() === "auto")) size.hasAutoMargins = true;
        const display = map?.get("display")?.toString();
        if (display === "grid" || display === "inline-grid") {
          const columns = map?.get("grid-template-columns")?.toString();
          const rows = map?.get("grid-template-rows")?.toString();
          const autoRows = map?.get("grid-auto-rows")?.toString();
          if (columns !== undefined) size.gridTemplateColumns = columns;
          if (rows !== undefined) size.gridTemplateRows = rows;
          if (autoRows !== undefined) size.gridAutoRows = autoRows;
        }
        out[path] = size;
      }
      // DOMSnapshot exposes open shadow children at the host, and assigned elements at their slot.
      const children = el.shadowRoot ? Array.from(el.shadowRoot.children)
        : el instanceof HTMLSlotElement && el.assignedNodes().length ? el.assignedElements() : Array.from(el.children);
      children.forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return out;
  }, { selector, properties: [...STYLE_WHITELIST] });
}
