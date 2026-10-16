import type { SemNode } from "../model/semantic.ts";
export const visit = (n: SemNode, fn: (n: SemNode) => void) => {
  fn(n);
  for (const a of n.alternatives ?? []) visit(a, fn);
  if (n.kind === "stack" || n.kind === "grid") for (const c of n.children) visit(c, fn);
  if (n.kind === "control") {
    if (n.label) visit(n.label, fn);
    for (const c of n.content) visit(c, fn);
  }
  for (const o of n.overlays) visit(o.node, fn);
};
