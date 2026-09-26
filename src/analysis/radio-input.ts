import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";

/** HTML groups use exact nonempty names and actual form ownership, independent of rendered wrappers. */
export function applyRadioInput(node: LayoutNode, spec: ControlSpec): void {
  spec.value = node.attrs.value ?? "on";
  const name = node.attrs.name;
  if (!name) return;
  if (node.formOwner === undefined) {
    spec.notes.push("approximated: radio capture has no form ownership metadata → independent selection; recapture to preserve named groups");
    return;
  }
  spec.radioGroup = JSON.stringify([node.formOwner, name]);
}
