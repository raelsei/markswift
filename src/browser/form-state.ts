import type { Raw } from "./snapshot-types.ts";

/** Effective disabled state includes fieldsets; their first legend subtree stays enabled. */
export function applyInheritedDisabledState(nodes: Raw[]): void {
  for (const node of nodes) {
    if (!["input", "button", "select", "textarea"].includes(node.name)) continue;
    for (let ancestor = node.parent, branch = node; ancestor; branch = ancestor, ancestor = ancestor.parent) {
      if (ancestor.name !== "fieldset" || ancestor.attrs.disabled === undefined) continue;
      const legend = ancestor.children.find(child => child.type === 1 && child.name === "legend");
      if (branch === legend) continue;
      node.attrs.disabled = "";
      break;
    }
  }
}
