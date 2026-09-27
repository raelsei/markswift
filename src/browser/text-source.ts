/** Live structural source join before display:contents flattening or layout pruning. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";
import type { TextSourceCapture, TextSourceOccurrence } from "../model/text-source.ts";

export interface LiveTextSourceNode {
  key: string; type: number; name: string; value: string;
  ancestors: TextSourceOccurrence["ancestors"];
}
interface LiveTextSourceTree {
  nodes: LiveTextSourceNode[];
  root: TextSourceCapture["root"];
}

/** Converter-side claims only; the verifier captures its expected ledger independently. */
export async function readTextSources(page: Page, selector: string): Promise<LiveTextSourceTree> {
  return page.evaluate(selector => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`capture root ${selector} not found`);
    const nodes: LiveTextSourceNode[] = [];
    const walk = (node: Node, key: string, ancestors: TextSourceOccurrence["ancestors"]) => {
      nodes.push({ key, type: node.nodeType, name: node.nodeName.toLowerCase(), value: node.nodeValue ?? "", ancestors });
      // Initial contract declines shadow/slot composition; light DOM nodes still retain their raw paths.
      const next = node instanceof Element ? [...ancestors, { key, tag: node.tagName.toLowerCase(), display: getComputedStyle(node).display }] : ancestors;
      [...node.childNodes].forEach((child, index) => walk(child, key === "dom:/" ? `${key}${index}` : `${key}/${index}`, next));
    };
    walk(element, "dom:/", []);
    const externalAncestors: TextSourceCapture["root"]["externalAncestors"] = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const computed = getComputedStyle(ancestor), styles: Record<string, string> = {};
      for (const property of computed) styles[property] = computed.getPropertyValue(property);
      externalAncestors.push({ tag: ancestor.tagName.toLowerCase(), styles });
    }
    return { nodes, root: { key: "dom:/", type: 1, tag: element.tagName.toLowerCase(), externalAncestors } };
  }, selector);
}

export function attachTextSources(root: Raw, input: LiveTextSourceTree | LiveTextSourceNode[]): void {
  const nodes = Array.isArray(input) ? input : input.nodes;
  const live = new Map<string, LiveTextSourceNode>(), seen = new Set<string>();
  const capture: TextSourceCapture = { version: 1, trust: "converter-capture-claim",
    root: Array.isArray(input) ? { key: "dom:/", type: 1, tag: root.name, externalAncestors: [] } : input.root,
    occurrences: [], unavailable: [] };
  for (const entry of nodes) {
    if (live.has(entry.key)) capture.unavailable.push(`duplicate live source key ${entry.key}`);
    live.set(entry.key, entry);
  }
  const walk = (raw: Raw, key: string, origin: TextSourceOccurrence["origin"], parentMatched = true) => {
    const entry = live.get(key);
    const equality = parentMatched && origin === "dom" && entry?.type === raw.type && entry.name === raw.name && entry.value === raw.value;
    if (origin === "dom") {
      seen.add(key);
      if (!equality) capture.unavailable.push(`source join unavailable ${key}: ${entry ? entry.value !== raw.value ? "value mismatch" : "type/name mismatch" : "live occurrence missing"}`);
    }
    const kind = raw.type === 3 ? "text" : raw.name === "br" ? "br" : raw.name === "wbr" ? "wbr" : undefined;
    if (kind) {
      const source: TextSourceOccurrence = { key, kind, raw: raw.type === 3 ? raw.value : "", ancestors: entry?.ancestors ?? [],
        origin, join: equality ? "verified" : "unavailable", layoutPresent: raw.bounds !== undefined };
      raw.textSource = source;
      capture.occurrences.push(source);
    }
    let index = 0;
    raw.children.forEach((child, ordinal) => {
      if (child.pseudo !== undefined) {
        walk(child, `${key}/::${child.pseudo}:${ordinal}`, "generated", false);
      } else if (child.shadowRootType !== undefined) {
        capture.unavailable.push(`shadow composition unavailable ${key}/${ordinal}`);
        walk(child, `${key}/shadow-unavailable:${ordinal}`, "unavailable", false);
      } else {
        const childKey = key === "dom:/" ? `${key}${index++}` : `${key}/${index++}`;
        walk(child, childKey, origin, equality);
      }
    });
  };
  walk(root, "dom:/", "dom");
  for (const [key, entry] of live) if (!seen.has(key)) {
    capture.unavailable.push(`raw source occurrence missing ${key}`);
    const kind = entry.type === 3 ? "text" : entry.name === "br" ? "br" : entry.name === "wbr" ? "wbr" : undefined;
    if (kind) capture.occurrences.push({ key, kind, raw: entry.type === 3 ? entry.value : "", ancestors: entry.ancestors, origin: "dom", join: "unavailable", layoutPresent: false });
  }
  const liveOrder = new Map(nodes.map((entry, index) => [entry.key, index]));
  capture.occurrences.sort((a, b) => (liveOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (liveOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  root.textSourceCapture = capture;
}
