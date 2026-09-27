import type { CDPSession, Page } from "playwright-core";
import type { SourceContentVisibility } from "./content-visibility.ts";

/** Evaluated in the page; returned references identify exactly the objects we rewrote. */
async function finishPageSettle(): Promise<Element[]> {
  const forced: Element[] = [];
  for (const el of document.querySelectorAll("*")) {
    const cv = getComputedStyle(el).contentVisibility;
    if (cv === "auto") {
      (el as HTMLElement).style.setProperty("content-visibility", "visible", "important");
      forced[forced.length] = el;
    } else if (cv === "hidden") {
      for (const child of el.children) (child as HTMLElement).style.setProperty("display", "none", "important");
    }
  }
  for (const animation of document.getAnimations()) {
    try { animation.finish(); } catch { animation.cancel(); }
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return forced;
}

/** Public CDP identities prevent stale pre-settle values from authorizing rewritten nodes. */
export async function settleVisibility(page: Page, cdp?: CDPSession): Promise<SourceContentVisibility> {
  if (!cdp) { await page.evaluate(finishPageSettle); return new Map(); }
  const objectGroup = "markswift-settle-visibility";
  try {
    const evaluated = await cdp.send("Runtime.evaluate", {
      expression: `(${finishPageSettle.toString()})()`, awaitPromise: true, returnByValue: false, objectGroup,
    });
    const objectId = evaluated.result.objectId;
    if (evaluated.exceptionDetails || !objectId || evaluated.result.subtype !== "array") throw new Error("Could not identify settled visibility overrides");
    const properties = await cdp.send("Runtime.getProperties", { objectId, ownProperties: true });
    if (properties.exceptionDetails) throw new Error("Could not read settled visibility overrides");
    const length = properties.result.find(property => property.name === "length")?.value?.value;
    const entries = properties.result.filter(property => /^(0|[1-9]\d*)$/.test(property.name));
    if (!Number.isSafeInteger(length) || length < 0 || entries.length !== length) throw new Error("Incomplete settled visibility identities");
    const result = new Map<number, { name: string; value: string }>();
    for (let index = 0; index < length; index++) {
      const reference = entries.find(property => property.name === String(index))?.value?.objectId;
      if (!reference) throw new Error("Missing settled DOM object reference");
      const { node } = await cdp.send("DOM.describeNode", { objectId: reference });
      const id = node.backendNodeId, name = node.nodeName.toLowerCase();
      if (node.nodeType !== 1 || !name || !Number.isSafeInteger(id) || id <= 0 || result.has(id)) throw new Error("Ambiguous settled DOM object identity");
      result.set(id, { name, value: "auto" });
    }
    return result;
  } finally { await cdp.send("Runtime.releaseObjectGroup", { objectGroup }); }
}
