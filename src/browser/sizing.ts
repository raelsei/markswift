/** Read cascaded sizing without mutating the page or trying to parse framework stylesheets. */
import type { Page } from "playwright-core";
import type { PreferredSize } from "../model/layout.ts";

export type PreferredSizes = Record<string, PreferredSize>;

/** DOM element paths match snapshot traversal; text and generated pseudo-elements do not count. */
export async function readPreferredSizes(page: Page, selector: string): Promise<PreferredSizes> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const out: Record<string, PreferredSize> = {};
    const walk = (el: Element, path: string) => {
      const typed = el as Element & {
        computedStyleMap?: () => { get(property: string): { toString(): string } | undefined };
      };
      const map = typed.computedStyleMap?.();
      const width = map?.get("width")?.toString();
      const height = map?.get("height")?.toString();
      if (width !== undefined && height !== undefined) {
        const entry: (typeof out)[string] = { width, height };
        const position = map?.get("position")?.toString();
        if (position === "absolute" || position === "fixed") {
          const inset = (k: string) => map?.get(k)?.toString() ?? "auto";
          entry.insets = { top: inset("top"), right: inset("right"), bottom: inset("bottom"), left: inset("left") };
        }
        const autoMargins = (["top", "right", "bottom", "left"] as const).filter(
          (k) => map?.get(`margin-${k}`)?.toString() === "auto",
        );
        if (autoMargins.length) entry.autoMargins = autoMargins;
        const tracks = map?.get("grid-template-columns")?.toString();
        if (tracks && tracks !== "none") entry.gridTemplateColumns = tracks;
        const display = map?.get("display")?.toString();
        const rows = map?.get("grid-template-rows")?.toString();
        if ((display === "grid" || display === "inline-grid") && rows && rows !== "none") entry.gridTemplateRows = rows;
        out[path] = entry;
      }
      Array.from(el.children).forEach((child, i) => {
        walk(child, path ? `${path}/${i}` : String(i));
      });
    };
    walk(root, "");
    return out;
  }, selector);
}
