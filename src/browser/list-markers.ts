/** Default Blink marker shapes use primary-font metrics, not the generated text glyph. */
import type { CDPSession, Page } from "playwright-core";
import type { MarkerLayout } from "../model/layout.ts";
import type { Raw } from "./snapshot-types.ts";

export type MarkerLayouts = Record<string, MarkerLayout>;

export async function readMarkerLayouts(page: Page, selector: string, cdp: CDPSession): Promise<MarkerLayouts> {
  const captured = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`capture root ${selector} not found`);
    const context = document.createElement("canvas").getContext("2d")!;
    const result: Record<string, { symbol: string; fontAscent: number; fontDescent: number; fontSize: number; summary?: number }> = {};
    const summaries: Element[] = Array.from(document.querySelectorAll("summary"));
    const walk = (element: Element, path: string) => {
      if (element.shadowRoot || element instanceof HTMLSlotElement) return;
      const own = getComputedStyle(element), style = getComputedStyle(element, "::marker");
      if (own.display === "list-item" && style.content === "normal" && style.listStyleImage === "none"
        && style.writingMode === "horizontal-tb" && style.direction === "ltr"
        && ["disc", "circle", "square", "disclosure-open", "disclosure-closed"].includes(style.listStyleType)) {
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = context.measureText("M"), fontSize = parseFloat(style.fontSize);
        if (metrics.fontBoundingBoxAscent > 0 && metrics.fontBoundingBoxDescent >= 0 && fontSize > 0) {
          const details = element.parentElement;
          const summary = element.tagName === "SUMMARY" && details instanceof HTMLDetailsElement
            && Array.from(details.children).find(child => child.tagName === "SUMMARY") === element
            && style.listStyleType === (details.open ? "disclosure-open" : "disclosure-closed") ? summaries.indexOf(element) : undefined;
          result[path] = { symbol: style.listStyleType, fontAscent: metrics.fontBoundingBoxAscent,
            fontDescent: metrics.fontBoundingBoxDescent, fontSize, ...(summary !== undefined ? { summary } : {}) };
        }
      }
      Array.from(element.children).forEach((child, i) => walk(child, path ? `${path}/${i}` : String(i)));
    };
    walk(root, "");
    return result;
  }, selector);
  const result: MarkerLayouts = {};
  const candidates = Object.values(captured).some(metric => metric.summary !== undefined);
  let summaryNodes: number[] = [];
  if (candidates) {
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    summaryNodes = (await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "summary" })).nodeIds;
  }
  for (const [path, { summary, symbol, ...metric }] of Object.entries(captured)) {
    let disclosureControl = false;
    if (summary !== undefined && summaryNodes[summary] !== undefined) {
      const matched = await cdp.send("CSS.getMatchedStylesForNode", { nodeId: summaryNodes[summary]! });
      // Conservative origin proof: any author list-style declaration (including shorthand,
      // inherit, revert and unused cascade candidates) leaves the triangle static.
      const affectsMarker = (properties: Array<{ name: string; disabled?: boolean }>) => properties.some(p => !p.disabled && (p.name === "all" || /^list-style(?:-|$)/.test(p.name)));
      const author = affectsMarker(matched.inlineStyle?.cssProperties ?? []) || affectsMarker(matched.attributesStyle?.cssProperties ?? [])
        || matched.matchedCSSRules?.some(match => match.rule.origin !== "user-agent" && affectsMarker(match.rule.style.cssProperties))
        || matched.pseudoElements?.some(pseudo => pseudo.pseudoType === "marker" && pseudo.matches.some(match => match.rule.origin !== "user-agent" && affectsMarker(match.rule.style.cssProperties)))
        || matched.inherited?.some(parent => affectsMarker(parent.inlineStyle?.cssProperties ?? []) || parent.matchedCSSRules.some(match => match.rule.origin !== "user-agent" && affectsMarker(match.rule.style.cssProperties)))
        || matched.cssKeyframesRules?.some(rule => rule.keyframes.some(frame => affectsMarker(frame.style.cssProperties)));
      const ua = matched.matchedCSSRules?.some(match => match.rule.origin === "user-agent"
        && match.rule.style.cssProperties.some(p => p.name === "list-style-type" && p.value === symbol));
      disclosureControl = !!ua && !author;
    }
    result[path] = { ...metric, symbol: symbol as MarkerLayout["symbol"], ...(disclosureControl ? { disclosureControl: true } : {}) };
  }
  return result;
}

/** Join before display:contents flattening; pseudo nodes do not consume element ordinals. */
export function attachMarkerLayouts(root: Raw, layouts: MarkerLayouts): void {
  const walk = (raw: Raw, path: string) => {
    if (raw.children.some(child => child.shadowRootType)) return;
    let index = 0;
    for (const child of raw.children) {
      if (child.pseudo === "marker" && layouts[path]) child.markerLayout = layouts[path];
      else if (child.type === 1 && child.pseudo === undefined) walk(child, path ? `${path}/${index++}` : String(index++));
    }
  };
  walk(root, "");
}
