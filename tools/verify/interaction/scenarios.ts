import type { ControlNode } from "../../../src/model/semantic.ts";
import type { CorpusFixture } from "../corpus-model.ts";
import type { InteractionPlan, InteractionStep } from "./types.ts";
import { disclosureSteps } from "./disclosure-scenarios.ts";

/** Only captured, implemented state is tested. Static callbacks are never invented for fixtures. */
export function interactionPlan(fixture: CorpusFixture, controls: readonly ControlNode[], width = 390,
  theme: "light" | "dark" = "light"): InteractionPlan {
  const steps: InteractionStep[] = [], covered = new Set<string>(), limitations: string[] = [];
  let transitionCount = 0;
  const value = (target: string, selected: boolean) => steps.push({ kind: "expectValue", target, value: selected ? "selected" : "unselected" });
  const radios = controls.filter(node => node.control === "radio"), radioState = new Map<string, boolean>();
  const groups = new Map<string, ControlNode[]>();
  for (const node of radios) {
    const key = node.radioGroup ?? `independent:${node.id}`;
    groups.set(key, [...groups.get(key) ?? [], node]);
  }
  for (const group of groups.values()) {
    const selected = group.findLast(node => node.checked);
    for (const node of group) { radioState.set(node.id, node === selected); value(node.id, node === selected); }
  }
  for (const group of groups.values()) {
    const next = group.find(node => !node.disabled && !radioState.get(node.id));
    if (!next) continue;
    covered.add(next.id); steps.push({ kind: "tap", target: next.id }); transitionCount++;
    for (const node of group) { covered.add(node.id); radioState.set(node.id, node === next); }
    // Assert other groups too: selecting one group must leave independent groups unchanged.
    for (const node of radios) value(node.id, radioState.get(node.id)!);
    steps.push({ kind: "tap", target: next.id });
    for (const node of group) value(node.id, node === next);
  }
  for (const node of controls) {
    if (node.control === "radio") {
      if (node.disabled) {
        steps.push({ kind: "expectEnabled", target: node.id, enabled: false }, { kind: "tapInert", target: node.id });
        value(node.id, radioState.get(node.id)!); covered.add(node.id);
      }
      continue;
    }
    if (node.control === "toggle") {
      value(node.id, !!node.checked); covered.add(node.id);
      if (node.disabled) {
        steps.push({ kind: "expectEnabled", target: node.id, enabled: false }, { kind: "tapInert", target: node.id });
        value(node.id, !!node.checked);
      } else {
        steps.push({ kind: "tap", target: node.id }); value(node.id, !node.checked);
        steps.push({ kind: "tap", target: node.id }); value(node.id, !!node.checked); transitionCount += 2;
      }
    } else if ((node.control === "textField" || node.control === "textEditor") && !node.disabled && !node.readOnly) {
      const text = node.control === "textEditor" ? "NativeUIInput2026\nSecondLine2026" : "NativeUIInput2026";
      steps.push({ kind: "expectValue", target: node.id, value: node.value ?? "" },
        { kind: "replaceText", target: node.id, text }, { kind: "expectValue", target: node.id, value: text });
      covered.add(node.id); transitionCount++;
    } else if (node.control === "picker" && node.selectList && !node.selectStatic) {
      transitionCount += listSteps(node, steps); covered.add(node.id);
    } else if (node.control === "disclosure") {
      const transitions = disclosureSteps(node, steps, limitations);
      transitionCount += transitions;
      if (transitions) covered.add(node.id);
    } else if (["secureField", "picker", "slider", "stepper", "datePicker", "colorPicker"].includes(node.control)) {
      limitations.push(`${node.id}: ${node.control} requires an additional authored native gesture scenario`);
    }
  }
  if (!steps.length) limitations.push("No implemented stateful control has a native gesture scenario");
  return { fixture: fixture.id, structureKey: fixture.structureKey, category: fixture.category, split: fixture.split,
    viewName: `${fixture.name}Interactions`, testName: `test_${fixture.id.replace(/[^A-Za-z0-9]/g, "_")}`,
    height: fixture.height, width, theme, steps, coveredControls: [...covered], transitionCount, limitations };
}

function listSteps(node: ControlNode, steps: InteractionStep[]): number {
  const choices = node.choices ?? [], available = choices.filter(choice => !choice.hidden && !choice.invisible);
  const selected = new Set(node.selectList === "multiple" ? node.selectedChoices ?? [] : [node.selectedChoice ?? -1]);
  const target = (id: number) => `${node.id}/option/${id}`;
  const expect = (id: number) => steps.push({ kind: "expectSelection", target: target(id), selected: selected.has(id), container: node.id });
  for (const choice of choices.filter(choice => choice.hidden || choice.invisible)) steps.push({ kind: "expectMissing", target: target(choice.id) });
  for (const choice of available.slice(0, 2)) {
    expect(choice.id); steps.push({ kind: "expectLabel", target: target(choice.id), label: choice.label, container: node.id });
  }
  const enabled = available.filter(choice => !node.disabled && !choice.disabled);
  const next = node.selectList === "single" ? enabled.find(choice => !selected.has(choice.id)) : enabled[0];
  if (!next) return 0;
  const activate = (id: number) => {
    steps.push({ kind: "tap", target: target(id), container: node.id });
    if (node.selectList === "single") { selected.clear(); selected.add(id); }
    else if (selected.has(id)) selected.delete(id); else selected.add(id);
    expect(id);
  };
  activate(next.id);
  // Single rows are selection-only. Multiple rows toggle independently of labels or values.
  if (node.selectList === "single") {
    for (const choice of available.filter(choice => choice.id !== next.id).slice(0, 2)) expect(choice.id);
    steps.push({ kind: "tap", target: target(next.id), container: node.id }); expect(next.id);
  } else {
    const other = enabled.find(choice => choice.id !== next.id);
    if (other) { activate(other.id); expect(next.id); }
  }
  const last = enabled.at(-1);
  if (last && last.id !== next.id) {
    // A real swipe occurs even if every row happens to fit in this viewport.
    steps.push({ kind: "scroll", target: node.id, direction: "up" }); activate(last.id);
  }
  for (const choice of available.filter(choice => choice.disabled)) {
    const before = selected.has(choice.id); expect(choice.id);
    steps.push({ kind: "tapInert", target: target(choice.id), container: node.id });
    steps.push({ kind: "expectSelection", target: target(choice.id), selected: before, container: node.id });
  }
  return 1 + (node.selectList === "multiple" && enabled.length > 1 ? 1 : 0) + (last && last.id !== next.id ? 1 : 0);
}
