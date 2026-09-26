import type { Raw } from "./snapshot-types.ts";

/** Preserve select semantics before unmeasured option descendants are discarded. */
export function attachSelectMetadata(nodes: Raw[], liveSelection: boolean): void {
  for (const node of nodes) {
    if (node.name === "option") {
      const text = optionText(node).replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
      // An empty @label has an empty IDL getter, but the rendered option falls back to its text.
      node.option = { label: node.attrs.label || text, value: node.attrs.value ?? text };
    }
    if (node.name === "select" && liveSelection) {
      node.selectedIndex = selectOptions(node).findIndex(option => option.attrs.selected !== undefined);
    }
  }
}

/** HTML-aware text excludes scripts and image descendants; NBSP is not ASCII whitespace. */
function optionText(node: Raw): string {
  if (node.type === 3) return node.value;
  if (node.name === "script" || node.name === "img") return "";
  return node.children.map(optionText).join("");
}

/** Select option lists flatten arbitrary wrappers but exclude nested option/select/datalist/hr trees. */
function selectOptions(node: Raw, grouped = false): Raw[] {
  return node.children.flatMap(child => {
    if (child.type !== 1) return [];
    if (child.name === "option") return [child];
    if (["select", "datalist", "hr"].includes(child.name) || (child.name === "optgroup" && grouped)) return [];
    return selectOptions(child, grouped || child.name === "optgroup");
  });
}
