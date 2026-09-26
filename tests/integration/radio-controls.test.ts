import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

function radios(root: LayoutNode): Map<string, LayoutNode> {
  const found = new Map<string, LayoutNode>();
  const visit = (node: LayoutNode) => {
    if (node.tag === "input" && node.attrs.type === "radio") found.set(node.attrs.id!, node);
    node.children.forEach(visit);
  };
  visit(root);
  return found;
}

browserTest("radio grouping preserves actual form ownership before wrappers and capture roots are trimmed", async () => {
  const result = await convertHtml(`<body>
    <form id="external"><input type="radio" name="outside" checked></form>
    <main data-markswift-root>
      <form id="first" style="display:contents">
        <input id="a" type="radio" name="same" checked><input id="b" type="radio" name="same">
        <input id="empty-form" type="radio" name="free" form="" checked>
        <input id="bad-form" type="radio" name="free" form="missing">
      </form>
      <input id="explicit" type="radio" name="same" form="first">
      <form id="dup"><input id="dup-a" type="radio" name="duplicate" checked></form>
      <form id="dup"><input id="dup-b" type="radio" name="duplicate" checked></form>
      <input id="dup-explicit" type="radio" name="duplicate" form="dup">
      <div id="not-form"></div><form><input id="id-trap" type="radio" name="free" form="not-form"></form>
      <input id="case-a" type="radio" name="Case" checked><input id="case-b" type="radio" name="case" checked>
      <input id="space-a" type="radio" name=" spaced" checked><input id="space-b" type="radio" name="spaced" checked>
      <input id="unnamed" type="radio" checked><input id="empty-name" type="radio" name="" checked>
      <input id="outside" type="radio" name="outside" form="external">
    </main></body>`, { name: "FormRadios" });
  // JSON consumers must retain ownership; a flattened display:contents form cannot reconstruct it.
  const layout = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)));
  const nodes = radios(layout.root);
  const owner = (id: string) => nodes.get(id)!.formOwner;
  expect(owner("a")).toBeDefined();
  expect(owner("a")).toBe(owner("b"));
  expect(owner("a")).toBe(owner("explicit"));
  expect(owner("dup-a")).not.toBe(owner("dup-b"));
  expect(owner("dup-a")).toBe(owner("dup-explicit"));
  expect(owner("empty-form")).toBe(owner("bad-form"));
  expect(owner("empty-form")).toBe(owner("id-trap"));
  expect(owner("outside")).not.toBe(owner("empty-form"));
  const controls = new Map<string, ControlNode>();
  walk(inferScreen(layout, "FormRadios").root, node => {
    if (node.kind === "control" && node.control === "radio") controls.set(node.id.replace(/^#/, ""), node);
  });
  expect(controls.get("a")!.radioGroup).toBe(controls.get("b")!.radioGroup);
  expect(controls.get("a")!.radioGroup).toBe(controls.get("explicit")!.radioGroup);
  expect(controls.get("case-a")!.radioGroup).not.toBe(controls.get("case-b")!.radioGroup);
  expect(controls.get("space-a")!.radioGroup).not.toBe(controls.get("space-b")!.radioGroup);
  expect(controls.get("unnamed")!.radioGroup).toBeUndefined();
  expect(controls.get("empty-name")!.radioGroup).toBeUndefined();
  expect(controls.get("outside")!.checked).not.toBe(true);
  expect(controls.get("a")!.value).toBe("on");
  expect(result.diagnostics.flatMap(diagnostic => diagnostic.notes).some(note => note.includes("independent native toggle"))).toBe(false);
}, 30000);

browserTest("parser-repaired table forms retain actual radio ownership rather than DOM ancestry", async () => {
  const result = await convertHtml(`<main data-markswift-root><table>
    <form id="parser-form"><tr><td><input id="repaired" type="radio" name="choice" checked></td></tr></form>
    </table><input id="associated" type="radio" name="choice" form="parser-form">
    <input id="unowned" type="radio" name="choice" checked></main>`, { name: "RepairedRadios" });
  const nodes = radios(result.layout.root);
  expect(nodes.get("repaired")!.formOwner).toBeDefined();
  expect(nodes.get("repaired")!.formOwner).toBe(nodes.get("associated")!.formOwner);
  expect(nodes.get("repaired")!.formOwner).not.toBe(nodes.get("unowned")!.formOwner);
  expect(nodes.get("repaired")!.attrs).toHaveProperty("checked");
  expect(nodes.get("unowned")!.attrs).toHaveProperty("checked");
}, 30000);
