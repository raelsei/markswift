import type { CDPSession, Page } from "playwright-core";
import type { BrowserControlObservation } from "./browser-types.ts";

export async function browserBackendNodes(cdp: CDPSession, selectors: Record<string, string>): Promise<Record<string, number>> {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const nodes: Record<string, number> = {};
  for (const [id, selector] of Object.entries(selectors)) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`Original browser target disappeared: ${id}`);
    nodes[id] = (await cdp.send("DOM.describeNode", { nodeId })).node.backendNodeId;
  }
  return nodes;
}

export async function observeBrowserControls(page: Page, selectors: Record<string, string>, backend: Record<string, number>,
  accessibleBackendIDs: readonly number[]): Promise<Record<string, BrowserControlObservation>> {
  const controls = await page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).map(([id, selector]) => {
    const element = document.querySelector(selector)!;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    const option = element instanceof HTMLOptionElement, input = element instanceof HTMLInputElement;
    const owner = element instanceof HTMLDetailsElement ? element : element.tagName === "SUMMARY" && element.parentElement instanceof HTMLDetailsElement
      && Array.from(element.parentElement.children).find(child => child.tagName === "SUMMARY") === element ? element.parentElement : undefined;
    let closedAncestor = false;
    for (let child: Element = element, parent = child.parentElement; parent; child = parent, parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open && child !== Array.from(parent.children).find(candidate => candidate.tagName === "SUMMARY")) closedAncestor = true;
    }
    return [id, { tag: element.tagName.toLowerCase(), label: option ? element.label : element.textContent ?? "",
      ...(input || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? { value: element.value } : {}),
      ...(input && ["checkbox", "radio"].includes(element.type) ? { checked: element.checked } : {}),
      ...(option ? { selected: element.selected, value: element.value } : {}),
      ...(owner ? { expanded: owner.open } : {}),
      disabled: element.matches(":disabled") || !!element.closest("select:disabled"),
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !closedAncestor,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ...(element instanceof HTMLSelectElement ? { selectedOrdinals: Array.from(element.options).flatMap((option, ordinal) => option.selected ? [ordinal] : []), scrollTop: element.scrollTop } : {}),
    }];
  })), selectors);
  return Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, { ...control, backendNodeID: backend[id]!, accessible: accessibleBackendIDs.includes(backend[id]!) }]));
}
