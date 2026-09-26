/** Select choices retain identity, submitted value and display text as separate properties. */
import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";

type SourceOption = { node: LayoutNode; disabled: boolean; hidden: boolean };

export function applySelectInput(node: LayoutNode, spec: ControlSpec): void {
  const options: SourceOption[] = [];
  const grouped = collectOptions(node, false, options);
  const choices = options.map(({ node: option, disabled, hidden }, id) => {
    const text = optionText(option).replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
    return {
      id, value: option.option?.value ?? option.attrs.value ?? text,
      label: option.option?.label ?? (option.attrs.label || text), disabled,
      ...((option.option?.hidden ?? hidden) ? { hidden: true } : {}),
    };
  });
  spec.choices = choices;
  spec.options = choices.map(choice => choice.label);
  const selected = options.flatMap(({ node: option }, index) => option.attrs.selected !== undefined ? [index] : []);
  const multiple = node.attrs.multiple !== undefined;
  const listbox = multiple || Number.parseInt(node.attrs.size ?? "0", 10) > 1;
  // A captured -1 is an intentional empty selection. Legacy layouts without live metadata
  // use authored selected attributes, or the first enabled option like a one-line HTML select.
  spec.selectedChoice = node.selectedIndex ?? (multiple ? selected[0] : selected.at(-1)) ?? (listbox ? -1 : choices.find(choice => !choice.disabled)?.id ?? -1);
  if (listbox) {
    spec.selectStatic = true;
    const indices = multiple ? selected : [spec.selectedChoice];
    spec.value = indices.map(index => choices[index]?.label ?? "").join("\n");
    spec.notes.push("approximated: <select multiple/size> list box → static selected labels; option rows, scrolling and editing require a custom selection view");
  } else {
    spec.value = choices[spec.selectedChoice]?.label ?? "";
    spec.notes.push("approximated: <select> → native menu; browser option appearance and form submission require app integration");
  }
  if (!choices.length) {
    spec.selectStatic = true;
    spec.notes.push("approximated: <select> has no captured options → static empty selection");
  }
  if (grouped) {
    spec.notes.push("approximated: <select> optgroup headings are flattened; disabled groups keep their options disabled");
  }
}

function collectOptions(node: LayoutNode, inheritedDisabled: boolean, options: SourceOption[], inGroup = false, inheritedHidden = false): boolean {
  let grouped = false;
  for (const child of node.children) {
    if (["select", "datalist", "hr"].includes(child.tag) || (inGroup && child.tag === "optgroup")) continue;
    const hidden = inheritedHidden || child.attrs.hidden !== undefined || child.styles.display === "none";
    if (child.tag === "option") options.push({ node: child, disabled: inheritedDisabled || child.attrs.disabled !== undefined, hidden });
    else {
      const isGroup = child.tag === "optgroup";
      grouped = isGroup || grouped;
      grouped = collectOptions(child, inheritedDisabled || (isGroup && child.attrs.disabled !== undefined), options, inGroup || isGroup, hidden) || grouped;
    }
  }
  return grouped;
}

function optionText(node: LayoutNode): string {
  if (node.tag === "#text") return node.text ?? "";
  return node.children.map(optionText).join("");
}
