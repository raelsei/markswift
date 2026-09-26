/** A single HTML select uses ordinal state: duplicate labels and values remain separate choices. */
import type { ControlNode } from "../model/semantic.ts";
import { indent, str } from "./format.ts";

export function selectExpr(node: ControlNode, state: string | undefined, still: boolean, label: string[]): string[] {
  if (node.selectStatic || still || (!state && node.choices !== undefined)) {
    const text = painted(node.value ?? "", node.selectStatic ? ".topLeading" : ".leading");
    return node.selectStatic ? text : ["HStack(spacing: 4.0) {", ...indent(text, 1), '    Image(systemName: "chevron.down")', "}"];
  }
  if (node.choices !== undefined) {
    const choices = node.choices.map(choice => `(id: ${choice.id}, value: ${str(choice.value)}, label: ${str(choice.label)}, disabled: ${choice.disabled ? "true" : "false"}, hidden: ${choice.hidden ? "true" : "false"})`);
    return [
      "Group {",
      `    let choices: [(id: Int, value: String, label: String, disabled: Bool, hidden: Bool)] = [${choices.join(", ")}]`,
      `    let selected = choices.first(where: { $0.id == ${state} })`,
      "    SwiftUI.Menu {",
      "        ForEach(choices.indices, id: \\.self) { index in",
      "            let choice = choices[index]",
      "            if !choice.hidden {",
      "                Button {",
      `                    ${state} = choice.id`,
      "                } label: {",
      "                    Text(verbatim: choice.label)",
      "                }",
      "                .disabled(choice.disabled)",
      "            }",
      "        }",
      "    } label: {",
      "        HStack(spacing: 4.0) {",
      '            Text(verbatim: selected?.label ?? "")',
      "                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)",
      '            Image(systemName: "chevron.down")',
      "        }",
      "    }",
      "    .buttonStyle(.plain)",
      "}",
    ];
  }
  // Manual ControlNode callers from before choice metadata retain their String picker binding.
  const options = node.options?.length ? node.options : node.value !== undefined ? [node.value] : [];
  return [
    `Picker(selection: ${state ? `$${state}` : ""}) {`,
    `    ForEach(${options.length ? `[${options.map(str).join(", ")}]` : "[String]()"}, id: \\.self) { option in`,
    "        Text(option)",
    "    }",
    "} label: {",
    ...indent(label, 1),
    "}",
    ".pickerStyle(.menu)",
  ];
}

function painted(text: string, alignment: string): string[] {
  return [`Text(verbatim: ${str(text)})`, `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${alignment})`];
}
