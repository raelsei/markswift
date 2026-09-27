import type { DomSnapshot, Raw } from "./snapshot-types.ts";

interface SourceVisibility { name: string; value: string }
export type SourceContentVisibility = ReadonlyMap<number, SourceVisibility>;

/** A one-property snapshot before settle overrides; only measured, unique real DOM objects qualify. */
export function readSourceContentVisibility(snapshot: DomSnapshot): SourceContentVisibility {
  const result = new Map<number, SourceVisibility>(), seen = new Set<number>(), ambiguous = new Set<number>();
  for (const document of snapshot.documents) {
    const nodes = document.nodes, ids = nodes.backendNodeId;
    if (!ids) continue;
    const pseudo = new Set(nodes.pseudoType?.index ?? []);
    const laidOut = new Map(document.layout.nodeIndex.map((node, index) => [node, index]));
    for (let index = 0; index < nodes.nodeType.length; index++) {
      const id = ids[index];
      if (id === undefined || !Number.isInteger(id) || id <= 0) continue;
      if (seen.has(id)) { ambiguous.add(id); continue; }
      seen.add(id);
      if (nodes.nodeType[index] !== 1 || pseudo.has(index)) continue;
      const layout = laidOut.get(index), style = layout === undefined ? undefined : document.layout.styles[layout]?.[0];
      const value = style === undefined ? undefined : snapshot.strings[style];
      const name = snapshot.strings[nodes.nodeName[index]!]?.toLowerCase();
      if (name && (value === "visible" || value === "auto" || value === "hidden")) result.set(id, { name, value });
    }
  }
  for (const id of ambiguous) result.delete(id);
  return result;
}

/** Backend IDs identify DOM objects across snapshots; markup and ordinal similarity are insufficient. */
export function attachSourceContentVisibility(tree: Raw, source: SourceContentVisibility, forced: SourceContentVisibility = new Map()): void {
  const nodes: Raw[] = [], counts = new Map<number, number>();
  const visit = (node: Raw) => { nodes.push(node); if (node.backendNodeId !== undefined) counts.set(node.backendNodeId, (counts.get(node.backendNodeId) ?? 0) + 1); node.children.forEach(visit); };
  visit(tree);
  for (const node of nodes) {
    delete node.sourceContentVisibility;
    delete node.visibilityWasForced;
    if (node.type !== 1 || node.pseudo || node.backendNodeId === undefined || counts.get(node.backendNodeId) !== 1) continue;
    const override = forced.get(node.backendNodeId);
    const original = override ?? source.get(node.backendNodeId);
    if (original?.name === node.name) node.sourceContentVisibility = original.value;
    if (override?.name === node.name && override.value === "auto") node.visibilityWasForced = true;
  }
}

export function contentVisibilityWarnings(root: Raw): string[] {
  let forced = false, observed = false;
  const inspect = (node: Raw) => { forced ||= node.visibilityWasForced === true; observed ||= node.sourceContentVisibility === "auto"; };
  const visit = (node: Raw) => { inspect(node); node.children.forEach(visit); };
  visit(root);
  for (let ancestor = root.parent; ancestor; ancestor = ancestor.parent) inspect(ancestor);
  if (forced) return ["Source content-visibility:auto was forced to visible for measurement; original containment and skipped-content rendering are not reproduced"];
  return observed ? ["Source content-visibility:auto was observed before settling; original containment and skipped-content rendering are not reproduced"] : [];
}
