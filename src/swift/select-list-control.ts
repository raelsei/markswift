import type { ControlNode, SelectRowAppearance } from "../model/semantic.ts";
import { colorArgs, fontExpr, num, str } from "./format.ts";

/** Exported so native verification executes the exact assignment used by the row's action. */
export function selectListActivation(node: ControlNode, state: string): string {
  const transition = node.selectList === "multiple" ? "markswiftToggleSelect" : "markswiftSelectOne";
  return `${state} = ${transition}(${state}, choice: choice${node.disabled ? ", disabled: true" : ""})`;
}

export function selectListExpr(node: ControlNode, state: string | undefined, still: boolean): string[] {
  if (still && node.selectRows !== undefined) return capturedRows(node);
  const choices = (node.choices ?? []).map(choice => `MarkswiftSelectChoice(id: ${choice.id}, value: ${str(choice.value)}, label: ${str(choice.label)}, disabled: ${!!choice.disabled}, hidden: ${!!choice.hidden}${choice.invisible ? ", invisible: true" : ""}${choice.group ? `, groupID: ${choice.group.id}, groupLabel: ${str(choice.group.label)}${choice.group.invisible ? ", groupInvisible: true" : ""}` : ""})`);
  const seed = node.selectList === "multiple" ? `[${(node.selectedChoices ?? []).join(", ")}]` : (node.selectedChoice ?? -1) < 0 ? "[]" : `[${node.selectedChoice}]`;
  const selected = still || !state ? seed : node.selectList === "multiple" ? state : `${state} < 0 ? [] : [${state}]`;
  const initiallySelected = new Set(node.selectList === "multiple" ? node.selectedChoices ?? [] : [node.selectedChoice ?? -1]);
  const appearance = (node.choices ?? []).flatMap(choice => choice.row ? [`${choice.id}: ${rowAppearance(choice.row, initiallySelected.has(choice.id))}`] : []);
  const groups = new Map((node.choices ?? []).flatMap(choice => choice.group?.row ? [[choice.group.id, choice.group.row] as const] : []));
  const groupAppearance = [...groups].map(([id, row]) => `${id}: ${rowAppearance(row, false)}`);
  return [
    "MarkswiftSelectionList(",
    `    choices: [${choices.join(", ")}],`,
    `    selected: ${selected},`,
    ...(appearance.length ? [`    appearance: [${appearance.join(", ")}],`] : []),
    ...(groupAppearance.length ? [`    groupAppearance: [${groupAppearance.join(", ")}],`] : []),
    `    disabled: ${!!node.disabled},`,
    `    interactive: ${!still && !!state}`,
    ...(!still && state ? [") { choice in", `    ${selectListActivation(node, state)}`, "}"] : [")"]),
  ];
}

function rowAppearance(row: SelectRowAppearance, selected: boolean): string {
  return `MarkswiftSelectRowAppearance(height: ${num(row.height)}, padding: ${insets(row.padding)}, font: ${fontExpr(row.font, { mode: "app" })}, color: ${row.color ? `SwiftUI.Color.markswift(${colorArgs(row.color)})` : ".primary"}, background: ${row.background ? `SwiftUI.Color.markswift(${colorArgs(row.background)})` : ".clear"}, initiallySelected: ${selected})`;
}

function capturedRows(node: ControlNode): string[] {
  const rows = (node.selectRows ?? []).map(row => `MarkswiftCapturedSelectRow(label: ${str(row.label)}, frame: CGRect(x: ${num(row.frame.x)}, y: ${num(row.frame.y)}, width: ${num(row.frame.w)}, height: ${num(row.frame.h)}), padding: ${insets(row.padding)}, font: ${fontExpr(row.font, { mode: "fidelity" })}, color: ${row.color ? `SwiftUI.Color.markswift(${colorArgs(row.color)})` : ".primary"}, background: ${row.background ? `SwiftUI.Color.markswift(${colorArgs(row.background)})` : ".clear"})`);
  return ["MarkswiftCapturedSelectRows(", `    rows: [${rows.join(", ")}],`, `    inset: ${insets(node.padding)}`, ")"];
}

function insets(padding: [number, number, number, number]): string {
  return `SwiftUI.EdgeInsets(top: ${num(padding[0])}, leading: ${num(padding[3])}, bottom: ${num(padding[2])}, trailing: ${num(padding[1])})`;
}
