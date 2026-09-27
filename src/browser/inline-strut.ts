import type { Page } from "playwright-core";
import type { LayoutNode } from "../model/layout.ts";
import type { Raw } from "./snapshot-types.ts";

type InlineMetrics = Record<string, { strut?: LayoutNode["inlineStrut"]; margins?: LayoutNode["inlineControlMargins"] }>;

/** Font-box facts and Typed OM intent only: no DOM insertion or native target coordinates. */
export async function readInlineStruts(page: Page, selector: string): Promise<InlineMetrics> {
  return page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const out: Record<string, { strut?: { ascent: number; descent: number; lineHeight: number }; margins?: [number, number, number, number] }> = {};
    const canvas = document.createElement("canvas").getContext("2d")!;
    const mark = (el: Element) => el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type);
    const walk = (el: Element, path: string) => {
      if (el.shadowRoot || el instanceof HTMLSlotElement) return;
      if (Array.from(el.children).some(mark)) {
        const style = getComputedStyle(el);
        if (style.writingMode === "horizontal-tb" && style.direction === "ltr") {
          canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = canvas.measureText("Hg"), ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
          const lineHeight = style.lineHeight === "normal" ? ascent + descent : parseFloat(style.lineHeight);
          if ([ascent, descent, lineHeight].every(Number.isFinite) && ascent > 0 && descent >= 0 && lineHeight > 0)
            out[path] = { strut: { ascent, descent, lineHeight } };
        }
      }
      if (mark(el)) {
        const typed = el as Element & { computedStyleMap?: () => { get(name: string): { toString(): string } | undefined } };
        const map = typed.computedStyleMap?.(), values = ["top", "right", "bottom", "left"].map(edge => map?.get(`margin-${edge}`)?.toString());
        if (values.every(value => value !== undefined && /^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value)))
          out[path] = { ...out[path], margins: values.map(value => parseFloat(value!)) as [number, number, number, number] };
      }
      Array.from(el.children).forEach((child, index) => walk(child, path ? `${path}/${index}` : String(index)));
    };
    walk(root, ""); return out;
  }, selector);
}

/** Join before boxless nodes and unmeasured text are pruned. */
export function attachInlineStruts(root: Raw, metrics: InlineMetrics): void {
  const walk = (node: Raw, path: string) => {
    const metric = metrics[path];
    if (metric?.strut) node.inlineStrut = metric.strut;
    if (metric?.margins) node.inlineControlMargins = metric.margins;
    let index = 0;
    for (const child of node.children) if (child.type === 1 && child.pseudo === undefined)
      walk(child, path ? `${path}/${index++}` : String(index++));
  };
  walk(root, "");
}
