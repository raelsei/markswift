/** Select choices retain identity, submitted value and display text as separate properties. */
import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";
import { selectGroupHeight, selectPaintRows, selectRowAppearance } from "./select-paint.ts";

export type SourceOption = { node: LayoutNode; disabled: boolean; hidden: boolean; group?: LayoutNode };

export function applySelectInput(node: LayoutNode, spec: ControlSpec): void {
  const options: SourceOption[] = [];
  const grouped = collectOptions(node, false, options);
  const multiple = node.attrs.multiple !== undefined;
  const listbox = multiple || Number.parseInt(node.attrs.size ?? "0", 10) > 1;
  const groups = [...new Set(options.flatMap(option => option.group ? [option.group] : []))];
  const groupRows = groups.map(group => selectRowAppearance(group, selectGroupHeight(group, options)));
  const choices = options.map(({ node: option, disabled, hidden, group }, id) => {
    const text = optionText(option).replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
    const row = listbox ? selectRowAppearance(option) : undefined;
    const groupRow = group ? groupRows[groups.indexOf(group)] : undefined;
    return {
      id, value: option.option?.value ?? option.attrs.value ?? text,
      label: option.option?.label ?? (option.attrs.label || text), disabled,
      ...((option.option?.hidden ?? hidden) ? { hidden: true } : {}),
      ...(listbox && option.styles.visibility === "hidden" ? { invisible: true } : {}),
      ...(row ? { row } : {}),
      ...(listbox && group ? { group: { id: groups.indexOf(group), label: group.attrs.label ?? "", ...(group.styles.visibility === "hidden" ? { invisible: true } : {}), ...(groupRow ? { row: groupRow } : {}) } } : {}),
    };
  });
  spec.choices = choices;
  spec.options = choices.map(choice => choice.label);
  const selected = options.flatMap(({ node: option }, index) => option.attrs.selected !== undefined ? [index] : []);
  // A captured -1 is an intentional empty selection. Legacy layouts without live metadata
  // use authored selected attributes, or the first enabled option like a one-line HTML select.
  spec.selectedChoice = node.selectedIndex ?? (multiple ? selected[0] : selected.at(-1)) ?? (listbox ? -1 : choices.find(choice => !choice.disabled)?.id ?? -1);
  if (listbox) {
    spec.selectList = multiple ? "multiple" : "single";
    if (multiple) spec.selectedChoices = selected;
    spec.selectRows = selectPaintRows(node, options, choices);
    const indices = multiple ? selected : [spec.selectedChoice];
    spec.value = indices.map(index => choices[index]?.label ?? "").join("\n");
    spec.notes.push("approximated: <select multiple/size> → native scrollable selection rows; browser list row paint, keyboard range selection, validation and form submission require app integration");
    spec.notes.push("approximated: native select list initial scroll position starts at the top; fidelity retains the captured browser scroll position when row measurements exist");
    spec.notes.push("approximated: dynamic CSS option selection styling is not reconstructed; changed rows keep their own captured text paint and use a native highlight or the select background");
    if (spec.selectRows === undefined) spec.notes.push("approximated: select list row measurements unavailable; fidelity uses static native option rows and cannot retain the browser scroll position");
    else spec.notes.push("approximated: select fidelity retains measured visible row positions, labels and plain colors; browser glyph metrics and richer option styling may differ");
  } else {
    spec.value = choices[spec.selectedChoice]?.label ?? "";
    spec.notes.push("approximated: <select> → native menu; browser option appearance and form submission require app integration");
  }
  if (!choices.length) {
    spec.selectStatic = true;
    spec.notes.push("approximated: <select> has no captured options → static empty selection");
  }
  if (grouped && !listbox) {
    spec.notes.push("approximated: <select> optgroup headings are flattened; disabled groups keep their options disabled");
  }
}

function collectOptions(node: LayoutNode, inheritedDisabled: boolean, options: SourceOption[], inGroup = false, inheritedHidden = false, group?: LayoutNode): boolean {
  let grouped = false;
  for (const child of node.children) {
    if (["select", "datalist", "hr"].includes(child.tag) || (inGroup && child.tag === "optgroup")) continue;
    const hidden = inheritedHidden || child.attrs.hidden !== undefined || child.styles.display === "none";
    if (child.tag === "option") options.push({ node: child, disabled: inheritedDisabled || child.attrs.disabled !== undefined, hidden, ...(group ? { group } : {}) });
    else {
      const isGroup = child.tag === "optgroup";
      grouped = isGroup || grouped;
      grouped = collectOptions(child, inheritedDisabled || (isGroup && child.attrs.disabled !== undefined), options, inGroup || isGroup, hidden, isGroup ? child : group) || grouped;
    }
  }
  return grouped;
}

function optionText(node: LayoutNode): string {
  if (node.tag === "#text") return node.text ?? "";
  return node.children.map(optionText).join("");
}
