/** Browser font-box measurements joined to real snapshot line boxes, without DOM mutation. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";

export type TextMetrics = Record<string, { ascent: number; descent: number }>;

export async function readTextMetrics(page: Page, selector: string): Promise<TextMetrics> {
  return page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const context = document.createElement("canvas").getContext("2d")!;
    const result: Record<string, { ascent: number; descent: number }> = {};
    const walk = (element: Element, path: string) => {
      // Shadow composition needs its own identity proof; leave this first slice unannotated.
      if (element.shadowRoot || element instanceof HTMLSlotElement) return;
      const style = getComputedStyle(element);
      if (style.writingMode !== "horizontal-tb" || style.direction !== "ltr") return;
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      let ordinal = 0;
      for (const child of element.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE) continue;
        const key = `${path}/#text:${ordinal++}`;
        const text = child.textContent ?? "";
        // This excludes fallback glyphs until their per-line font boxes are independently proved.
        if (!text.trim() || !/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)) continue;
        const metrics = context.measureText(text);
        if (Number.isFinite(metrics.fontBoundingBoxAscent) && Number.isFinite(metrics.fontBoundingBoxDescent)) {
          result[key] = { ascent: metrics.fontBoundingBoxAscent, descent: metrics.fontBoundingBoxDescent };
        }
      }
      Array.from(element.children).forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return result;
  }, selector);
}

/** Attach before display:contents flattening and before root-coordinate rebasing. */
export function attachTextMetrics(root: Raw, metrics: TextMetrics): void {
  const walk = (raw: Raw, path: string) => {
    if (raw.children.some(child => child.shadowRootType)) return;
    let ordinal = 0, elementIndex = 0;
    for (const child of raw.children) {
      if (child.type === 3) {
        const metric = metrics[`${path}/#text:${ordinal++}`];
        if (!metric || !child.bounds) continue;
        const lines = child.lines?.length ? child.lines : [{ bounds: child.bounds, start: 0, length: child.text?.length ?? 0 }];
        if (metric.ascent <= 0 || metric.descent < 0 || lines.some(line => Math.abs(line.bounds.h - metric.ascent - metric.descent) > 0.15)) continue;
        child.firstBaseline = Math.min(...lines.map(line => line.bounds.y + metric.ascent));
        if (child.lines) child.lines = child.lines.map(line => ({ ...line, baseline: line.bounds.y + metric.ascent }));
      } else if (child.type === 1 && child.pseudo === undefined) {
        const childPath = path ? `${path}/${elementIndex++}` : String(elementIndex++);
        walk(child, childPath);
      }
    }
  };
  walk(root, "");
}
