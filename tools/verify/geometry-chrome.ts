import type { Page } from "playwright-core";
import { htmlIdentity } from "../../src/input/identity.ts";
import type { NodeIdentity } from "../../src/input/types.ts";
import type { ChromeGeometry } from "./geometry.ts";
import { readPseudoBorders } from "./geometry-cdp.ts";

/** Live painted border rectangles; intentionally independent of LayoutDoc and its transform probe. */
export async function readChromeGeometry(page: Page, selector: string, identity: NodeIdentity = htmlIdentity): Promise<ChromeGeometry> {
  const measurement = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Geometry root ${selector} not found`);
    const origin = root.getBoundingClientRect();
    const elements: Array<{ path: string; tag: string; attrs: Record<string, string>; rendered: boolean; visibility?: "boxless" | "unpainted"; frame?: { x: number; y: number; w: number; h: number };
      scroll?: { width: number; height: number; viewportWidth: number; viewportHeight: number; left: number; top: number; transformed: boolean } }> = [];
    const seen = new Set<Element>();
    const walk = (element: Element, path: string) => {
      if (seen.has(element)) throw new Error("Repeated composed geometry element");
      seen.add(element);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hasBox = style.display !== "contents" && element.getClientRects().length > 0;
      // getClientRects may force layout behind a closed details UA content-visibility
      // boundary. checkVisibility tests the real flat tree, including authored overrides.
      const painted = element.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true });
      const rendered = hasBox && painted;
      const scrollable = /^(auto|scroll)$/.test(style.overflowX) || /^(auto|scroll)$/.test(style.overflowY);
      let transformed = false;
      for (let ancestor: Element | null = element; ancestor;) {
        if (getComputedStyle(ancestor).transform !== "none") transformed = true;
        const tree = ancestor.getRootNode();
        ancestor = ancestor.assignedSlot ?? ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
      }
      elements.push({ path, tag: element.localName, attrs: Object.fromEntries(Array.from(element.attributes).map(attr => [attr.name, attr.value])), rendered,
        ...(!rendered ? { visibility: hasBox ? "unpainted" as const : "boxless" as const } : {}),
        ...(rendered ? { frame: { x: rect.x - origin.x, y: rect.y - origin.y, w: rect.width, h: rect.height } } : {}),
        ...(rendered && scrollable ? { scroll: { width: element.scrollWidth, height: element.scrollHeight, viewportWidth: element.clientWidth,
          viewportHeight: element.clientHeight, left: element.scrollLeft, top: element.scrollTop, transformed } } : {}) });
      const children = element.shadowRoot ? Array.from(element.shadowRoot.children)
        : element instanceof HTMLSlotElement && element.assignedNodes().length ? element.assignedElements() : Array.from(element.children);
      children.forEach((child, index) => walk(child, path ? `${path}/${index}` : String(index)));
    };
    walk(root, "");
    return { width: origin.width, height: origin.height, origin: { x: origin.x, y: origin.y }, elements };
  }, selector);
  const pseudos = await readPseudoBorders(page, selector, measurement.elements, measurement.origin);
  return { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb", width: measurement.width, height: measurement.height,
    elements: [...measurement.elements.map(({ attrs, ...element }) => ({ ...element, observation: "element-border" as const, sourceId: identity(element.tag, attrs, element.path) })),
      ...pseudos.elements.map(element => ({ ...element, observation: "pseudo-border" as const, sourceId: identity(element.tag, {}, element.path) }))],
    ...(pseudos.unavailable.length ? { unavailableObservations: pseudos.unavailable } : {}) };
}
