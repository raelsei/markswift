import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

function byId(root: LayoutNode, id: string): LayoutNode {
  const find = (node: LayoutNode): LayoutNode | undefined => node.attrs.id === id ? node : node.children.map(find).find(Boolean);
  const found = find(root);
  if (!found) throw new Error(`missing #${id}`);
  return found;
}

browserTest("captures live form state after page preparation rather than initial attributes", async () => {
  const html = `<main data-h2s-root style="width:320px;min-height:280px">
    <input id="name" value="old">
    <input id="off" type="checkbox" checked>
    <input id="on" type="checkbox">
    <input id="disabled" value="locked">
    <textarea id="message">old message</textarea>
    <select id="choice" disabled>
      <option value="old" selected>Old choice</option>
      <option value="new">New choice</option>
    </select>
  </main>`;
  const result = await convertHtml(html, {
    name: "LiveForm",
    async prepare(page) {
      await page.evaluate(() => {
        (document.querySelector("#name") as HTMLInputElement).value = "new";
        (document.querySelector("#off") as HTMLInputElement).checked = false;
        (document.querySelector("#on") as HTMLInputElement).checked = true;
        (document.querySelector("#disabled") as HTMLInputElement).disabled = true;
        (document.querySelector("#message") as HTMLTextAreaElement).value = "updated message";
        (document.querySelector("#choice") as HTMLSelectElement).disabled = false;
        (document.querySelector("#choice") as HTMLSelectElement).value = "new";
      });
    },
  });
  const root = result.layout.root;
  expect(byId(root, "name").attrs.value).toBe("new");
  expect("checked" in byId(root, "off").attrs).toBe(false);
  expect("checked" in byId(root, "on").attrs).toBe(true);
  expect("disabled" in byId(root, "disabled").attrs).toBe(true);
  expect(byId(root, "message").attrs.value).toBe("updated message");
  const select = byId(root, "choice");
  expect("disabled" in select.attrs).toBe(false);
  const options = select.children.filter((child) => child.tag === "option");
  expect(options).toHaveLength(2);
  expect(options.map((option) => "selected" in option.attrs)).toEqual([false, true]);
  expect(result.code).toContain("updated message");
  expect(result.code).not.toContain("old message");
  expect(result.code).toContain("New choice");
}, 30000);

browserTest("disabled fieldsets preserve the first legend exemption and nested fieldset state", async () => {
  const result = await convertHtml(`<main data-markswift-root><fieldset disabled>
    <legend><input id="exempt" value="Editable"><button id="exempt-button">Enabled</button></legend>
    <legend><input id="second-legend" value="Locked"></legend>
    <input id="inherited" value="Locked"><button id="inherited-button">Locked</button>
    <select id="inherited-picker"><option>Choice</option></select><textarea id="inherited-editor">Locked</textarea>
    <fieldset><legend><input id="nested" value="Locked"></legend></fieldset>
  </fieldset><input id="outside" value="Editable"></main>`, { name: "DisabledFieldsets" });
  for (const id of ["second-legend", "inherited", "inherited-button", "inherited-picker", "inherited-editor", "nested"]) {
    expect(byId(result.layout.root, id).attrs).toHaveProperty("disabled");
  }
  for (const id of ["exempt", "exempt-button", "outside"]) expect(byId(result.layout.root, id).attrs).not.toHaveProperty("disabled");
  const controls: ControlNode[] = [];
  walk(inferScreen(result.layout, "DisabledFieldsets").root, node => { if (node.kind === "control") controls.push(node); });
  expect(controls.filter(node => node.disabled)).toHaveLength(6);
  expect(result.code.match(/\.disabled\(true\)/g)).toHaveLength(6);
}, 30000);

browserTest("readonly fields retain text without editable bindings; readonly checkbox remains interactive", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    const result = await convertHtml(`<main data-markswift-root>
      <input id="read-name" readonly value="Ada"><input id="read-password" readonly type="password" value="secret">
      <textarea id="read-message" readonly>Locked notes</textarea><input id="read-date" readonly type="date" value="2026-09-26">
      <input id="check" readonly type="checkbox" checked><input id="editable" value="Edit me">
    </main>`, { name: "ReadonlyFields", mode });
    expect(result.code).toContain('Text(verbatim: "Ada")');
    expect(result.code).toContain('Text(verbatim: "Locked notes")');
    expect(result.code).toContain('Text(verbatim: "2026-09-26")');
    expect(result.code).toContain('Text(verbatim: "••••••")');
    expect(result.code).not.toContain("$s_read_name");
    expect(result.code).not.toContain("$s_read_message");
    expect(result.code).not.toContain("$s_read_password");
    expect(result.code).not.toContain("$s_read_date");
    expect(result.code).toContain("$s_check");
    expect(result.diagnostics.flatMap(item => item.notes).filter(note => note.includes("readonly"))).toHaveLength(4);
    if (mode === "app") expect(result.code).toContain("$s_editable");
  }
}, 30000);
