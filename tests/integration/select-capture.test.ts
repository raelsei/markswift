import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function byId(root: LayoutNode, id: string): LayoutNode | undefined {
  return root.attrs.id === id ? root : root.children.map(node => byId(node, id)).find(Boolean);
}

browserTest("live select metadata retains nested labels, exact values, duplicate and disabled choices, and intentional no selection", async () => {
  const result = await convertHtml(`<main data-markswift-root>
    <select id="choices"><div><option value="first"><span>  Alpha   beta </span> Tail</option>
      <option value="second" selected>Alpha beta Tail</option></div>
      <option label="" value="">Fallback display text</option>
      <option>&nbsp;</option><option>  Space\n  value  </option>
      <optgroup label="Unavailable" disabled><option value="blocked">Blocked</option></optgroup>
    </select>
    <select id="empty"><option selected>First</option><option>Second</option></select>
    <select id="disabled-selected"><optgroup disabled><option selected value="keep">Still selected</option></optgroup><option>Enabled</option></select>
    <select id="multiple" multiple><option selected value="a">One</option><option selected value="b">Two</option></select>
  </main>`, { name: "SelectCapture", prepare: async page => {
    await page.evaluate(() => { (document.querySelector("#empty") as HTMLSelectElement).selectedIndex = -1; });
  } });
  const layout = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)));
  expect(byId(layout.root, "choices")!.selectedIndex).toBe(1);
  expect(byId(layout.root, "empty")!.selectedIndex).toBe(-1);
  const controls = new Map<string, ControlNode>();
  walk(inferScreen(layout, "SelectCapture").root, node => {
    if (node.kind === "control" && node.control === "picker") controls.set(node.id.replace(/^#/, ""), node);
  });
  expect(controls.get("choices")!.choices).toEqual([
    { id: 0, label: "Alpha beta Tail", value: "first", disabled: false },
    { id: 1, label: "Alpha beta Tail", value: "second", disabled: false },
    { id: 2, label: "Fallback display text", value: "", disabled: false },
    { id: 3, label: "\u00a0", value: "\u00a0", disabled: false },
    { id: 4, label: "Space value", value: "Space value", disabled: false },
    { id: 5, label: "Blocked", value: "blocked", disabled: true },
  ]);
  expect(controls.get("choices")!.selectedChoice).toBe(1);
  expect(controls.get("empty")!).toMatchObject({ value: "", selectedChoice: -1 });
  expect(controls.get("disabled-selected")!).toMatchObject({ value: "Still selected", selectedChoice: 0 });
  expect(controls.get("disabled-selected")!.choices![0]!.disabled).toBe(true);
  expect(controls.get("multiple")!).toMatchObject({ value: "One\nTwo", selectStatic: true });
  expect(result.code).not.toContain("@State private var s_multiple");
  expect(result.code).toContain("@State private var s_empty: Int = -1");
  expect(result.code).toContain('value: "second"');
}, 30000);

browserTest("hidden placeholder and CSS-hidden options retain selection identity without becoming menu choices", async () => {
  const result = await convertHtml(`<style>#css-option { display:none } .hidden-group { display:none }</style>
    <main data-markswift-root><select id="hidden-choices">
      <option hidden selected value="">Choose a region</option>
      <option id="css-option" value="css">CSS hidden</option>
      <optgroup class="hidden-group"><option value="group">Hidden group</option></optgroup>
      <option value="visible">Visible region</option>
      <option hidden style="display:block" value="override">Visible override</option>
    </select></main>`, { name: "HiddenChoices" });
  const layout = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)));
  const controls: ControlNode[] = [];
  walk(inferScreen(layout, "HiddenChoices").root, node => { if (node.kind === "control" && node.control === "picker") controls.push(node); });
  expect(controls[0]!).toMatchObject({ selectedChoice: 0, value: "Choose a region" });
  expect(controls[0]!.choices!.map(choice => [choice.id, choice.value, choice.hidden ?? false])).toEqual([
    [0, "", true], [1, "css", true], [2, "group", true], [3, "visible", false], [4, "override", false],
  ]);
  expect(result.code).toContain("if !choice.hidden {");
}, 30000);
