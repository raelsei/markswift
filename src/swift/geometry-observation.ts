import type { SemNode } from "../model/semantic.ts";
import { str } from "./format.ts";

export type GeometryRole = "border" | "scroll-content" | "scroll-viewport";
export interface GeometryManifestNode {
  key: string;
  sourceId: string;
  kind: SemNode["kind"];
  parent?: string;
  relation: string;
  role: GeometryRole;
  /** Helper emitted in source; runtime realization is reported separately by actual frames. */
  instrumented: boolean;
}
export interface GeometryManifest { version: 1; namespace: string; nodes: GeometryManifestNode[] }
export interface GeometryInstrumentation {
  manifest: GeometryManifest;
  keys: Map<SemNode, string>;
  entries: Map<string, GeometryManifestNode>;
  suppressed: Set<SemNode>;
}

/** Keys identify semantic occurrences; source ids remain separate and may collide. */
export function geometryInstrumentation(root: SemNode, namespace: string): GeometryInstrumentation {
  const state: GeometryInstrumentation = { manifest: { version: 1, namespace, nodes: [] }, keys: new Map(), entries: new Map(), suppressed: new Set() };
  const walk = (node: SemNode, path: string, parent: string | undefined, relation: string) => {
    if (state.keys.has(node)) throw new Error("Geometry instrumentation requires a tree of distinct semantic occurrences");
    const key = `${namespace}/${path}`;
    state.keys.set(node, key);
    const entry: GeometryManifestNode = { key, sourceId: node.id, kind: node.kind, parent, relation,
      role: node.kind === "stack" && node.scroll ? "scroll-content" : "border", instrumented: false };
    state.manifest.nodes.push(entry); state.entries.set(key, entry);
    if (node.kind === "stack" || node.kind === "grid") node.children.forEach((child, i) => walk(child, `${path}/children/${i}`, key, `children/${i}`));
    if (node.kind === "control") {
      if (node.label) walk(node.label, `${path}/label`, key, "label");
      node.content.forEach((child, i) => walk(child, `${path}/content/${i}`, key, `content/${i}`));
    }
    node.overlays.forEach((overlay, i) => walk(overlay.node, `${path}/overlays/${i}`, key, `overlays/${i}`));
    if (node.kind === "stack" && node.scroll) {
      const viewport = { ...entry, key: `${key}/viewport`, role: "scroll-viewport" as const };
      state.manifest.nodes.push(viewport); state.entries.set(viewport.key, viewport);
    }
  };
  walk(root, "root", undefined, "root");
  return state;
}

export function geometryAlias(replacement: SemNode, original: SemNode, state?: GeometryInstrumentation, viewport = false): void {
  const key = state?.keys.get(original);
  if (state && key) state.keys.set(replacement, viewport ? `${key}/viewport` : key);
}

export function geometryModifier(node: SemNode, state?: GeometryInstrumentation, viewport = false): string[] {
  if (!state || state.suppressed.has(node)) return [];
  const baseKey = state.keys.get(node);
  const key = viewport && baseKey ? `${baseKey}/viewport` : baseKey;
  const entry = key ? state.entries.get(key) : undefined;
  if (!entry) return [];
  entry.instrumented = true;
  return [`.markswiftObserveGeometry(${str(entry.key)}, role: ${str(entry.role)})`];
}
