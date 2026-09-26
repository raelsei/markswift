import type { ControlNode, SemNode } from "../model/semantic.ts";
import { walk } from "../model/semantic.ts";

interface RadioGroup { owner: ControlNode; selected?: number }
interface RadioMember { group: RadioGroup; choice: number }

/** DOM grouping comes from analysis; native choices use identity, never duplicate HTML ids/values. */
export function radioMembers(root: SemNode): Map<SemNode, RadioMember> {
  const members = new Map<SemNode, RadioMember>();
  const named = new Map<string, RadioGroup>();
  walk(root, node => {
    if (node.kind !== "control" || node.control !== "radio") return;
    const group = (node.radioGroup ? named.get(node.radioGroup) : undefined) ?? { owner: node };
    if (node.radioGroup) named.set(node.radioGroup, group);
    const choice = members.size;
    if (node.checked) group.selected = choice;
    members.set(node, { group, choice });
  });
  return members;
}

/** Radio activation only selects; ToggleStyle's attempt to clear an active radio is ignored. */
export function radioBinding(state: string, choice: number, disabled = false): string {
  return `Binding<Bool>(get: { ${state} == ${choice} }, set: { selected in ${disabled ? "_ = selected" : `if selected { ${state} = ${choice} }`} })`;
}
