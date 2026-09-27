import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";
import { LayoutDoc } from "../../src/model/layout.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const html = `<main data-markswift-root style="width:300px;font:14px system-ui">
  <select id="many" multiple size="3" style="width:180px;height:80px">
    <option value="same" selected>Twin</option><option value="same">Twin</option><option value=""></option>
    <optgroup disabled label="Disabled"><option value="blocked" selected>Blocked</option></optgroup>
    <optgroup label="Enabled"><option value="nested"><span>Nested </span>label</option></optgroup>
    <option hidden value="hidden" selected>Hidden selected</option><option style="display:none">CSS hidden</option>
    <option>Final</option>
  </select>
  <select id="single" size="4"><option value="same">Twin</option><option value="same" selected>Twin</option></select>
  <fieldset disabled><select id="disabled" multiple><option selected>A</option><option>B</option></select></fieldset>
</main>`;

function controls(layout: LayoutDoc): Map<string, ControlNode> {
  const nodes = new Map<string, ControlNode>();
  walk(inferScreen(layout, "SelectionLists").root, node => { if (node.kind === "control") nodes.set(node.id, node); });
  return nodes;
}

browserTest("multiple capture retains every live selected ordinal and optgroup identity after JSON roundtrip", async () => {
  const result = await convertHtml(html, { name: "SelectionLists", async prepare(page) {
    await page.evaluate(() => {
      const many = document.querySelector("#many") as HTMLSelectElement;
      many.options[0]!.selected = false; many.options[1]!.selected = true; many.options[2]!.selected = true;
      (document.querySelector("#single") as HTMLSelectElement).selectedIndex = -1;
    });
  } });
  const nodes = controls(LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout))));
  const many = nodes.get("#many")!;
  expect(many.selectedChoices).toEqual([1, 2, 3, 5]);
  expect(many.choices?.map(choice => [choice.id, choice.value, choice.label])).toEqual([
    [0, "same", "Twin"], [1, "same", "Twin"], [2, "", ""], [3, "blocked", "Blocked"],
    [4, "nested", "Nested label"], [5, "hidden", "Hidden selected"], [6, "CSS hidden", "CSS hidden"], [7, "Final", "Final"],
  ]);
  expect(many.choices?.[3]).toMatchObject({ disabled: true, group: { id: 0, label: "Disabled" } });
  expect(many.choices?.[4]).toMatchObject({ disabled: false, group: { id: 1, label: "Enabled" } });
  expect(many.choices?.[5]?.hidden).toBe(true); expect(many.choices?.[6]?.hidden).toBe(true);
  expect(nodes.get("#single")).toMatchObject({ selectList: "single", selectedChoice: -1 });
  expect(nodes.get("#disabled")).toMatchObject({ disabled: true, selectedChoices: [0] });
  expect(result.code).toContain("@State private var s_many: Set<Int> = [1, 2, 3, 5]");
  expect(result.code).toContain("markswiftToggleSelect(s_disabled, choice: choice, disabled: true)");
}, 30000);

browserTest("fidelity captures scrolled visible rows without displaying a selected-label summary", async () => {
  const result = await convertHtml(html, { name: "ListPaint", mode: "fidelity", async prepare(page) {
    await page.evaluate(() => { (document.querySelector("#many") as HTMLSelectElement).scrollTop = 34; });
  } });
  const many = controls(result.layout).get("#many")!;
  expect(many.selectRows?.length).toBeGreaterThan(0);
  expect(many.selectRows?.some(row => row.frame.y < 0)).toBe(true);
  expect(many.selectRows?.some(row => row.kind === "group")).toBe(true);
  expect(many.selectRows?.some(row => row.label === "Hidden selected" || row.label === "CSS hidden")).toBe(false);
  expect(result.code).toContain("MarkswiftCapturedSelectRows(");
  expect(result.code).not.toContain('Text(verbatim: "Twin\\nBlocked\\nHidden selected")');
  expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("browser list row paint");
}, 30000);

browserTest("visibility-hidden options and headings keep row geometry and selected identity without visible actions", async () => {
  const result = await convertHtml(`<main data-markswift-root><select id="visibility" multiple size="5">
    <option selected style="visibility:hidden">Invisible selected</option>
    <optgroup label="Invisible heading" style="visibility:hidden"><option>Inherited invisible</option>
      <option style="visibility:visible">Visible override</option></optgroup><option>Visible</option>
  </select></main>`, { name: "InvisibleRows" });
  const list = controls(result.layout).get("#visibility")!;
  expect(list.selectedChoices).toEqual([0]);
  expect(list.choices?.map(choice => choice.invisible ?? false)).toEqual([true, true, false, false]);
  expect(list.choices?.slice(0, 2).every(choice => (choice.row?.height ?? 0) > 0)).toBe(true);
  expect(list.choices?.[1]?.group?.invisible).toBe(true);
  expect(list.selectRows?.map(row => row.label)).toEqual(["Visible override", "Visible"]);
  expect(result.code).toContain("hidden: false, invisible: true");
  expect(result.diagnostics.flatMap(item => item.notes).join(" ")).toContain("initial scroll position starts at the top");
}, 30000);

browserTest("display-hidden modern option wrappers retain ordinals and selections without exposing native choices", async () => {
  const result = await convertHtml(`<main data-markswift-root><select id="wrapped-hidden" multiple size="4">
    <option selected value="visible">Visible</option></select></main>`, { name: "HiddenOptionWrapper", async prepare(page) {
    await page.evaluate(() => {
      const select = document.querySelector("#wrapped-hidden") as HTMLSelectElement;
      const wrapper = document.createElement("div"); wrapper.style.display = "none";
      wrapper.innerHTML = '<option id="invisible-option" selected value="keep">Hidden selected</option><span><option value="nested">Nested hidden</option></span>';
      select.append(wrapper);
    });
    expect(await page.locator("#invisible-option").isVisible()).toBe(false);
    expect(await page.evaluate(() => (document.querySelector("#invisible-option") as HTMLOptionElement).selected)).toBe(true);
  } });
  const select = controls(LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)))).get("#wrapped-hidden")!;
  expect(select.choices?.map(choice => [choice.id, choice.value, choice.label, choice.hidden ?? false])).toEqual([
    [0, "visible", "Visible", false], [1, "keep", "Hidden selected", true], [2, "nested", "Nested hidden", true],
  ]);
  expect(select.selectedChoices).toEqual([0, 1]);
  expect(select.selectRows?.map(row => row.label)).toEqual(["Visible"]);
  expect(result.code).toContain('id: 1, value: "keep", label: "Hidden selected", disabled: false, hidden: true');
}, 30000);

nativeTest("complete generated multiple and single listbox bundles typecheck on iOS in both modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-list-ios-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml(html.replace("</main>", '<select><option selected>Menu choice</option></select></main>'), { name: "Menu", mode });
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const check = await typecheck(output);
      expect(check.ok, check.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
