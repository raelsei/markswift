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
    const out: Record<string, { width: string; height: string; flexBasis?: string; inlineSizeDefinite?: boolean; hasRelativePadding?: boolean; hasAutoMargins?: boolean; relativeInsets?: [string, string, string, string]; relativeContainingDirection?: "ltr" | "rtl"; gridTemplateColumns?: string; gridTemplateRows?: string; gridAutoRows?: string; columnStyles?: Record<string, string> }> = {};
    const definite = new WeakMap<Element, boolean>();
    const preferred = (el: Element, property: string): string | undefined => {
      const typed = el as Element & { computedStyleMap?: () => { get(property: string): { toString(): string } | undefined } };
      return typed.computedStyleMap?.().get(property)?.toString();
    };
    const parentBox = (el: Element): Element | undefined => {
      const tree = el.getRootNode();
      const parent = el.assignedSlot ?? el.parentElement ?? (tree instanceof ShadowRoot ? tree.host : undefined);
      return parent && getComputedStyle(parent).display === "contents" ? parentBox(parent) : parent ?? undefined;
    };
    // This proves only normal block sizing and explicit lengths, including ancestors outside
    // the captured subtree. A used pixel width is never evidence of CSS definiteness.
    const inlineSizeDefinite = (el: Element): boolean => {
      const known = definite.get(el);
      if (known !== undefined) return known;
      definite.set(el, false);
      const style = getComputedStyle(el);
      const width = preferred(el, "width");
      if (style.writingMode !== "horizontal-tb" || width === undefined) return false;
      if (["min-width", "max-width"].some(property => {
        const value = preferred(el, property);
        return value !== undefined && !/^(?:auto|none|(?:\d+(?:\.\d*)?|\.\d+)(?:px|%))$/.test(value);
      })) return false;
      let result = false;
      if (/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(width)) result = true;
      else if (style.float === "none" && /^(static|relative)$/.test(style.position)) {
        const parent = parentBox(el);
        const percentage = /^(?:\d+(?:\.\d*)?|\.\d+)%$/.test(width);
        const block = /^(block|flow-root|flex|grid)$/.test(style.display);
        if (el === document.documentElement) result = block && (width === "auto" || percentage);
        else if (parent && /^(block|flow-root)$/.test(getComputedStyle(parent).display)) {
          result = (percentage || (width === "auto" && block)) && inlineSizeDefinite(parent);
        }
      }
      definite.set(el, result);
      return result;
    };
    const walk = (el: Element, path: string) => {
      const typed = el as Element & { computedStyleMap?: () => { get(property: string): { toString(): string } | undefined; getAll?(property: string): Array<{ toString(): string }> } };
      const map = typed.computedStyleMap?.();
      const width = map?.get("width")?.toString();
      const height = map?.get("height")?.toString();
      if (width !== undefined && height !== undefined) {
        const size: typeof out[string] = { width, height, inlineSizeDefinite: inlineSizeDefinite(el) };
        if (el.localName === "col" || el.localName === "colgroup") {
          const style = getComputedStyle(el);
          size.columnStyles = Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
        }
        const basis = map?.get("flex-basis")?.toString();
        if (basis !== undefined && basis !== "auto") size.flexBasis = basis;
        if (["top", "right", "bottom", "left"].some(edge => map?.get(`padding-${edge}`)?.toString().includes("%"))) size.hasRelativePadding = true;
        if (["top", "right", "bottom", "left"].some(edge => map?.get(`margin-${edge}`)?.toString() === "auto")) size.hasAutoMargins = true;
        if (getComputedStyle(el).position === "relative") {
          const insets = ["top", "right", "bottom", "left"].map(edge => map?.get(edge)?.toString());
          if (insets.every(value => value !== undefined)) size.relativeInsets = insets as [string, string, string, string];
          let containing = parentBox(el);
          while (containing && getComputedStyle(containing).display === "inline") containing = parentBox(containing);
          if (containing) size.relativeContainingDirection = getComputedStyle(containing).direction === "rtl" ? "rtl" : "ltr";
        }
        const display = map?.get("display")?.toString();
        if (display === "grid" || display === "inline-grid") {
          const columns = map?.get("grid-template-columns")?.toString();
          const rows = map?.get("grid-template-rows")?.toString();
          const autoRowValues = map?.getAll?.("grid-auto-rows");
          const autoRows = autoRowValues?.length ? autoRowValues.map(value => value.toString()).join(" ") : map?.get("grid-auto-rows")?.toString();
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
