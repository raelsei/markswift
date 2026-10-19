/** Read cascaded sizing and pseudo-element styles DOMSnapshot omits, without mutating the page. */
import type { Page } from "playwright-core";
import type { LayoutNode, PreferredSize } from "../model/layout.ts";

export type PreferredSizes = Record<string, PreferredSize>;
export type PseudoStyles = Record<string, NonNullable<LayoutNode["pseudoStyles"]>>;

/** DOM element paths match snapshot traversal; text and generated pseudo-elements do not count. */
export async function readPreferredSizes(
  page: Page,
  selector: string,
): Promise<{ sizes: PreferredSizes; pseudoStyles: PseudoStyles }> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const PLACEHOLDER_KEYS = ["color", "-webkit-text-fill-color", "opacity", "font-style", "font-weight"];
    const BACKDROP_KEYS = ["background-color", "background-image", "opacity", "filter"];
    const out: Record<string, PreferredSize> = {};
    const pseudoStyles: PseudoStyles = {};
    const walk = (el: Element, path: string) => {
      const typed = el as Element & {
        computedStyleMap?: () => { get(property: string): { toString(): string } | undefined };
      };
      const map = typed.computedStyleMap?.();
      const width = map?.get("width")?.toString();
      const height = map?.get("height")?.toString();
      if (width !== undefined && height !== undefined) {
        const entry: (typeof out)[string] = { width, height };
        // Typed OM retains percentages that getComputedStyle flattens into a matrix. Resolve
        // that same transform at independent reference sizes to retain its affine translation.
        const transform = map?.get("transform")?.toString();
        if (transform?.includes("%")) {
          const probe = document.createElement("div");
          probe.style.setProperty("all", "initial", "important");
          for (const [key, value] of Object.entries({
            position: "fixed",
            visibility: "hidden",
            "pointer-events": "none",
            transform,
          }))
            probe.style.setProperty(key, value, "important");
          document.documentElement.appendChild(probe);
          try {
            const matrix = (w: number, h: number) => {
              probe.style.setProperty("width", `${w}px`, "important");
              probe.style.setProperty("height", `${h}px`, "important");
              return new DOMMatrix(getComputedStyle(probe).transform);
            };
            const zero = matrix(0, 0),
              wide = matrix(100, 0),
              tall = matrix(0, 100);
            if (zero.is2D && wide.is2D && tall.is2D) {
              const x: [number, number] = [(wide.e - zero.e) / 100, (tall.e - zero.e) / 100];
              const y: [number, number] = [(wide.f - zero.f) / 100, (tall.f - zero.f) / 100];
              if ([...x, ...y].some((v) => Math.abs(v) > 1e-8)) entry.transformTranslation = { x, y };
            }
          } finally {
            probe.remove();
          }
        }
        const position = map?.get("position")?.toString();
        if (position === "absolute" || position === "fixed" || position === "relative" || position === "sticky") {
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
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.hasAttribute("placeholder")) {
        const ph = getComputedStyle(el, "::placeholder");
        pseudoStyles[path] = {
          placeholder: Object.fromEntries(PLACEHOLDER_KEYS.map((k) => [k, ph.getPropertyValue(k)])),
        };
      }
      // A top-layer element (`showModal()`, `showPopover()`, fullscreen) paints its `::backdrop` over the viewport.
      // Typed OM reports `overlay: none` there; getComputedStyle has the used value.
      if (
        el.matches(":modal, :popover-open, :fullscreen") &&
        getComputedStyle(el).getPropertyValue("overlay") === "auto"
      ) {
        const bd = getComputedStyle(el, "::backdrop");
        pseudoStyles[path] = {
          ...pseudoStyles[path],
          backdrop: Object.fromEntries(BACKDROP_KEYS.map((k) => [k, bd.getPropertyValue(k)])),
        };
      }
      Array.from(el.children).forEach((child, i) => {
        walk(child, path ? `${path}/${i}` : String(i));
      });
    };
    walk(root, "");
    return { sizes: out, pseudoStyles };
  }, selector);
}

/** Relative boxes in parent coordinates, measured with transforms disabled. Diffing before/after
 * disabling relative insets preserves percentage-height and stretched flex/grid containing blocks. */
export async function relativePositions(page: Page, selector: string): Promise<Record<string, [number, number]>> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const out: Record<string, [number, number]> = {};
    const walk = (el: Element, path: string) => {
      if (getComputedStyle(el).position === "relative") {
        const rect = el.getBoundingClientRect(),
          parent = el.parentElement?.getBoundingClientRect();
        out[path] = [rect.x - (parent?.x ?? 0), rect.y - (parent?.y ?? 0)];
      }
      Array.from(el.children).forEach((child, i) => {
        walk(child, path ? `${path}/${i}` : String(i));
      });
    };
    walk(root, "");
    return out;
  }, selector);
}
