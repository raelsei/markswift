import { expect, test } from "bun:test";
import { controlOf } from "../../../src/analysis/controls.ts";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { ControlNode } from "../../../src/model/semantic.ts";
import { controlMembers, controlExpr } from "../../../src/swift/controls.ts";

function element(tag: string, attrs: Record<string, string> = {}, children: LayoutNode[] = [], text?: string): LayoutNode {
  return { tag, attrs, children, ...(text !== undefined ? { text } : {}),
    id: tag === "select" ? "#choice" : undefined,
    styles: { display: "inline-block", "font-family": "system-ui", "font-size": "14px" },
    bounds: { x: 0, y: 0, w: tag === "select" ? 200 : 0, h: tag === "select" ? 32 : 0 } };
}
function option(text: string, attrs: Record<string, string> = {}): LayoutNode {
  return element("option", attrs, [element("#text", {}, [], text)]);
}
function select(options: LayoutNode[], attrs: Record<string, string> = {}): LayoutNode {
  return element("select", attrs, options);
}
function compile(node: LayoutNode, mode: "app" | "fidelity" = "app") {
  const layout: LayoutDoc = { version: 1, source: "select-controls.html", combo: { screen: "select-controls", theme: "light", demoState: "normal" },
    size: { w: 200, h: 32 }, dpr: 1, canvas: "white", fonts: [], root: node };
  return compileLayout(layout, { name: "SelectControls", mode });
}

test("select choices distinguish ordinal identity, submitted value, duplicate labels and empty options", () => {
  const node = select([option("Twin", { value: "first" }), option("Twin", { value: "second", selected: "" }), option("", { value: "", label: "" })]);
  const spec = controlOf(node)!;
  expect(spec.choices).toEqual([
    { id: 0, value: "first", label: "Twin", disabled: false },
    { id: 1, value: "second", label: "Twin", disabled: false },
    { id: 2, value: "", label: "", disabled: false },
  ]);
  expect(spec.selectedChoice).toBe(1);
  const result = compile(node);
  expect(result.code).toContain("@State private var s_choice: Int = 1");
  expect(result.code).toContain("SwiftUI.Menu {");
  expect(result.code).toContain('(id: 1, value: "second", label: "Twin", disabled: false, hidden: false)');
  expect(result.code).toContain('(id: 2, value: "", label: "", disabled: false, hidden: false)');
  expect(result.code).toContain("ForEach(choices.indices, id: \\.self)");
  expect(result.code).toContain("s_choice = choice.id");
  expect(result.code).not.toContain('ForEach(["Twin", "Twin"');
});

test("browser option metadata takes priority while legacy defaults collapse ASCII spaces and preserve NBSP", () => {
  const captured = option("Dropped descendant");
  captured.option = { label: "Nested label", value: "Nested value" };
  const spec = controlOf(select([captured, option(" \t Alpha\n Beta \r"), option("\u00a0Keep\u00a0"), option("Text", { value: "", label: "" })]))!;
  expect(spec.choices?.map(choice => [choice.label, choice.value])).toEqual([
    ["Nested label", "Nested value"], ["Alpha Beta", "Alpha Beta"], ["\u00a0Keep\u00a0", "\u00a0Keep\u00a0"], ["Text", ""],
  ]);
});

test("modern select wrappers preserve flattened ordinals while nested choice-owning subtrees stay excluded", () => {
  const node = select([element("div", {}, [option("A"), option("B", { selected: "" }),
    element("optgroup", { label: "Outer" }, [option("C"), element("optgroup", { label: "Inner" }, [option("Excluded")])]),
    element("datalist", {}, [option("Excluded")]), element("select", {}, [option("Excluded")]),
  ])]);
  expect(controlOf(node)?.choices?.map(choice => [choice.id, choice.label])).toEqual([[0, "A"], [1, "B"], [2, "C"]]);
  expect(controlOf(node)?.selectedChoice).toBe(1);
  expect(controlOf(node)?.notes.join(" ")).toContain("optgroup headings are flattened");
});

test("disabled options and optgroups remain separate disabled choices including the captured selection", () => {
  const node = select([option("Direct", { disabled: "", value: "direct" }),
    element("optgroup", { disabled: "", label: "Unavailable" }, [option("Group choice", { value: "group", selected: "" })]),
    option("Available", { value: "live" })]);
  const spec = controlOf(node)!;
  expect(spec.choices?.map(choice => choice.disabled)).toEqual([true, true, false]);
  expect(spec.selectedChoice).toBe(1);
  expect(spec.value).toBe("Group choice");
  expect(compile(node).code).toContain(".disabled(choice.disabled)");
  expect(spec.notes.join(" ")).toContain("optgroup headings are flattened");
  expect(controlOf(select([option("Disabled", { disabled: "" }), option("First enabled")]))?.selectedChoice).toBe(1);
});

test("captured empty selection and truly empty selected option never fall back to another choice", () => {
  const empty = select([option("First"), option("Second")]);
  empty.selectedIndex = -1;
  expect(controlOf(empty)?.selectedChoice).toBe(-1);
  expect(controlOf(empty)?.value).toBe("");
  expect(compile(empty).code).toContain("@State private var s_choice: Int = -1");
  const blankLabel = select([option("First"), option("", { label: "", selected: "", value: "" })]);
  expect(controlOf(blankLabel)?.value).toBe("");
  const fidelity = compile(blankLabel, "fidelity");
  expect(fidelity.code).toContain('Text(verbatim: "")');
  expect(fidelity.code).not.toContain('Text(verbatim: "First")');
  expect(fidelity.code).not.toContain("SwiftUI.Menu");
});

test("an empty authored option label displays normalized text while its empty value stays empty", () => {
  const node = select([option(" \tVisible\n text \r", { label: "", value: "", selected: "" })]);
  const spec = controlOf(node)!;
  expect(spec.value).toBe("Visible text");
  expect(spec.choices).toEqual([{ id: 0, value: "", label: "Visible text", disabled: false }]);
  expect(compile(node).code).toContain('(id: 0, value: "", label: "Visible text", disabled: false, hidden: false)');
  expect(compile(node, "fidelity").code).toContain('Text(verbatim: "Visible text")');
});

test("hidden choices retain ordinal values and selected text without creating menu actions", () => {
  const cssHidden = option("CSS hidden", { value: "css" });
  cssHidden.styles.display = "none";
  const hiddenGroup = element("optgroup", { label: "Hidden group" }, [option("Group hidden", { value: "group" })]);
  hiddenGroup.styles.display = "none";
  const visibleOverride = option("Visible override", { hidden: "", value: "override" });
  visibleOverride.option = { label: "Visible override", value: "override", hidden: false };
  const capturedHidden = option("Captured hidden", { value: "captured" });
  capturedHidden.option = { label: "Captured hidden", value: "captured", hidden: true };
  const node = select([option("Visible"), option("Hidden selected", { hidden: "", selected: "", value: "selected" }),
    cssHidden, hiddenGroup, visibleOverride, capturedHidden]);
  const spec = controlOf(node)!;
  expect(spec.choices?.map(choice => [choice.id, choice.hidden ?? false])).toEqual([[0, false], [1, true], [2, true], [3, true], [4, false], [5, true]]);
  expect(spec.selectedChoice).toBe(1);
  expect(spec.value).toBe("Hidden selected");
  expect(spec.choices?.[1]?.value).toBe("selected");
  const result = compile(node);
  expect(result.code).toContain("@State private var s_choice: Int = 1");
  expect(result.code).toContain('(id: 1, value: "selected", label: "Hidden selected", disabled: false, hidden: true)');
  expect(result.code).toContain("if !choice.hidden {\n                Button {");
  expect(compile(node, "fidelity").code).toContain('Text(verbatim: "Hidden selected")');
});

test("multiple and listbox selects use native selection rows with honest fidelity diagnostics", () => {
  const multiple = select([option("One", { selected: "", value: "1" }), option("Two", { selected: "", value: "2" })], { multiple: "" });
  expect(controlOf(multiple)?.value).toBe("One\nTwo");
  for (const node of [multiple, select([option("One"), option("Two", { selected: "" })], { size: "3" })]) {
    const result = compile(node);
    expect(controlOf(node)?.selectStatic).toBeUndefined();
    expect(result.code).toContain("@State");
    expect(result.code).toContain("MarkswiftSelectionList(");
    expect(result.code).not.toContain("SwiftUI.Menu");
    expect(result.code).not.toContain('Image(systemName: "chevron.down")');
    expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("browser list row paint");
  }
  expect(controlOf(select([option("One")], { size: "1.5" }))?.selectStatic).toBeUndefined();
  expect(controlOf(select([option("One")], { size: "3px" }))?.selectList).toBe("single");
  expect(controlOf(select([option("One")], { size: "3" }))?.selectedChoice).toBe(-1);
  expect(compile(select([])).code).not.toContain("@State");
});

test("manual legacy ControlNode callers retain String picker state", () => {
  const node: ControlNode = {
    kind: "control", control: "picker", id: "legacy", content: [], value: "Two", options: ["One", "Two"],
    frame: { x: 0, y: 0, w: 100, h: 32 }, width: { kind: "fixed", px: 100 }, height: { kind: "fixed", px: 32 },
    padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, overlays: [], confidence: "mapped", notes: [],
  };
  const members = controlMembers(node);
  expect(members.decls).toContain('@State private var s_legacy: String = "Two"');
  const code = controlExpr(node, { stateOf: members.stateOf, actionOf: members.actionOf, child: () => [], mode: "app", theme: "light" }).join("\n");
  expect(code).toContain("Picker(selection: $s_legacy)");
  expect(code).toContain('ForEach(["One", "Two"], id: \\.self)');
});
