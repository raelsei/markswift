import { walk, type ControlNode } from "../../../src/model/semantic.ts";
import type { InteractionStep } from "./types.ts";

/** Test only open-captured, element-backed content and proved standard summary indicators. */
export function disclosureSteps(node: ControlNode, steps: InteractionStep[], limitations: string[]): number {
  if (!node.expanded || !node.disclosureLayout?.contentAvailable) {
    limitations.push(`${node.id}: closed disclosure opening has no captured content layout and is not tested`);
    return 0;
  }
  let standard = false;
  if (node.label) walk(node.label, label => { if (label.kind === "svg" && label.disclosureSymbol) standard = true; });
  const first = node.content[0];
  if (!standard || !node.label?.id || !first || first.id === node.id || (first.kind === "text" && first.sourceTag === "details")) {
    limitations.push(`${node.id}: disclosure gesture requires a proved standard summary and captured element-backed body`);
    return 0;
  }
  const summary = node.label.id, content = `${node.id}/content`;
  steps.push({ kind: "expectExpanded", target: summary, expanded: true }, { kind: "expectPresent", target: content, present: true },
    { kind: "tap", target: summary }, { kind: "expectExpanded", target: summary, expanded: false },
    { kind: "expectPresent", target: content, present: false }, { kind: "tap", target: summary },
    { kind: "expectExpanded", target: summary, expanded: true }, { kind: "expectPresent", target: content, present: true });
  return 2;
}
