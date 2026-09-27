import type { Page } from "playwright-core";
import type { GeometryRect } from "./geometry.ts";

interface PseudoHost {
  path: string;
  tag: string;
  attrs: Record<string, string>;
  visibility?: "boxless" | "unpainted";
}
export interface ChromePseudoBorder {
  path: string;
  tag: string;
  rendered: boolean;
  visibility?: "boxless" | "unpainted";
  frame?: GeometryRect;
}

/** CDP reports viewport quads, including transforms, rather than authored offsets. */
export function quadBounds(quad: number[], origin: { x: number; y: number }): GeometryRect {
  if (quad.length !== 8 || !quad.every(Number.isFinite)) throw new Error("Invalid CDP border quad");
  const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!], ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!];
  return { x: Math.min(...xs) - origin.x, y: Math.min(...ys) - origin.y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Bind live pseudo nodes to composed element paths without DOM mutation or fixture ids. */
export async function readPseudoBorders(page: Page, selector: string, hosts: PseudoHost[], origin: { x: number; y: number }) {
  const elements: ChromePseudoBorder[] = [];
  const unavailable: Array<{ path: string; reason: string }> = [];
  let client;
  try { client = await page.context().newCDPSession(page); }
  catch (error) { return { elements, unavailable: [{ path: "", reason: `CDP pseudo geometry unavailable: ${String(error)}` }] }; }
  const objectGroup = "markswift-independent-geometry";
  try {
    await client.send("DOM.enable");
    // Retained element handles follow exactly the same composed traversal as the independent
    // border reader. DOM.describeNode binds each handle to its real pseudo backend nodes.
    const expression = `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      if (!root) throw new Error("Geometry root vanished");
      const elements = [], seen = new Set();
      const walk = (element) => {
        if (seen.has(element)) throw new Error("Repeated composed geometry element");
        seen.add(element); elements.push(element);
        const children = element.shadowRoot ? Array.from(element.shadowRoot.children)
          : element instanceof HTMLSlotElement && element.assignedNodes().length ? element.assignedElements() : Array.from(element.children);
        children.forEach(walk);
      };
      walk(root); return elements;
    })()`;
    const evaluated = await client.send("Runtime.evaluate", { expression, objectGroup });
    if (evaluated.exceptionDetails || !evaluated.result.objectId) throw new Error("CDP composed element binding failed");
    const properties = await client.send("Runtime.getProperties", { objectId: evaluated.result.objectId, ownProperties: true });
    const handles = properties.result.filter(property => /^(0|[1-9]\d*)$/.test(property.name)).sort((a, b) => Number(a.name) - Number(b.name));
    if (handles.length !== hosts.length) throw new Error("DOM changed during independent pseudo measurement");
    for (const [index, property] of handles.entries()) {
      const host = hosts[index]!;
      if (!property.value?.objectId) throw new Error("Unavailable composed element handle");
      const { node } = await client.send("DOM.describeNode", { objectId: property.value.objectId, depth: 0, pierce: true });
      const attrs: Record<string, string> = {};
      for (let i = 0; i < (node.attributes?.length ?? 0); i += 2) attrs[node.attributes![i]!] = node.attributes![i + 1]!;
      if (node.localName !== host.tag || JSON.stringify(Object.entries(attrs).sort()) !== JSON.stringify(Object.entries(host.attrs).sort())) {
        throw new Error("DOM identity changed during independent pseudo measurement");
      }
      for (const pseudo of node.pseudoElements ?? []) {
        if (!/^(before|after|marker)$/.test(pseudo.pseudoType ?? "")) continue;
        const tag = `::${pseudo.pseudoType}`, path = host.path ? `${host.path}/${tag}` : tag;
        if (host.visibility === "unpainted") { elements.push({ path, tag, rendered: false, visibility: "unpainted" }); continue; }
        if (host.visibility === "boxless") {
          unavailable.push({ path, reason: "Pseudo paint visibility on a boxless host is not established" }); continue;
        }
        try {
          const { model } = await client.send("DOM.getBoxModel", { backendNodeId: pseudo.backendNodeId });
          elements.push({ path, tag, rendered: true, frame: quadBounds(model.border, origin) });
        } catch (error) {
          unavailable.push({ path, reason: `Actual CDP pseudo border unavailable: ${String(error)}` });
        }
      }
    }
  } catch (error) {
    unavailable.push({ path: "", reason: `Independent pseudo observation failed: ${String(error)}` });
  } finally {
    await client.send("Runtime.releaseObjectGroup", { objectGroup }).catch(() => {});
    await client.detach();
  }
  return { elements, unavailable };
}
