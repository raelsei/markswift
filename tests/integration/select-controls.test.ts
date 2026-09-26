import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

function controls(result: Awaited<ReturnType<typeof convertHtml>>): Map<string, ControlNode> {
  const nodes = new Map<string, ControlNode>();
  walk(inferScreen(result.layout, "SelectControls").root, node => { if (node.kind === "control") nodes.set(node.id, node); });
  return nodes;
}

const choicesHtml = `<main data-markswift-root style="width:320px;font:14px system-ui">
  <select id="choice"><option value="same" selected>Twin</option><option value="same">Twin</option>
    <option value="" label=""></option>
    <optgroup id="group" label="Unavailable" disabled><option value="blocked"><span>Nested </span>label</option></optgroup>
    <option> Keep </option>
  </select></main>`;

browserTest("select capture retains live duplicate choice identity, HTML values, exact labels and disabled groups", async () => {
  const result = await convertHtml(choicesHtml, { name: "CapturedSelect", async prepare(page) {
    await page.evaluate(() => {
      const select = document.querySelector("#choice") as HTMLSelectElement;
      select.options[0]!.value = "updated";
      select.options[0]!.disabled = true;
      select.options[1]!.value = "live-value";
      select.selectedIndex = 1;
    });
  } });
  const choice = controls(result).get("#choice")!;
  expect(choice.choices).toEqual([
    { id: 0, value: "updated", label: "Twin", disabled: true },
    { id: 1, value: "live-value", label: "Twin", disabled: false },
    { id: 2, value: "", label: "", disabled: false },
    { id: 3, value: "blocked", label: "Nested label", disabled: true },
    { id: 4, value: " Keep ", label: " Keep ", disabled: false },
  ]);
  expect(choice.selectedChoice).toBe(1);
  expect(choice.value).toBe("Twin");
  expect(result.code).toContain("@State private var s_choice: Int = 1");
  expect(result.code).toContain('value: "live-value", label: "Twin"');
  expect(result.code).toContain(".disabled(choice.disabled)");
  expect(result.code).toContain("SwiftUI.Menu");
}, 30000);

browserTest("selected empty label attributes paint option text in app and fidelity while preserving empty values", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    let authoredLabel: string | undefined;
    const result = await convertHtml(`<main data-markswift-root><select id="visible">
      <option value="" label="" selected> \tVisible\n text </option>
    </select></main>`, { name: "VisibleSelect", mode, async prepare(page) {
      authoredLabel = await page.evaluate(() => (document.querySelector("#visible option") as HTMLOptionElement).label);
    } });
    expect(authoredLabel).toBe("");
    const choice = controls(result).get("#visible")!;
    expect(choice.value).toBe("Visible text");
    expect(choice.choices).toEqual([{ id: 0, value: "", label: "Visible text", disabled: false }]);
    if (mode === "app") expect(result.code).toContain('(id: 0, value: "", label: "Visible text", disabled: false, hidden: false)');
    else expect(result.code).toContain('Text(verbatim: "Visible text")');
  }
}, 30000);

browserTest("captured blank choice and selectedIndex -1 retain exact fidelity labels", async () => {
  for (const selectedIndex of [2, -1]) {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml(choicesHtml, { name: "EmptySelect", mode, async prepare(page) {
        await page.evaluate(index => { (document.querySelector("#choice") as HTMLSelectElement).selectedIndex = index; }, selectedIndex);
      } });
      const choice = controls(result).get("#choice")!;
      expect(choice.selectedChoice).toBe(selectedIndex);
      expect(choice.value).toBe("");
      if (mode === "app") expect(result.code).toContain(`@State private var s_choice: Int = ${selectedIndex}`);
      else {
        expect(result.code).toContain('Text(verbatim: "")');
        expect(result.code).not.toContain('Text(verbatim: "Twin")');
        expect(result.code).not.toContain("SwiftUI.Menu");
      }
    }
  }
}, 30000);

browserTest("modern select wrappers retain browser option ordinals and nested option labels", async () => {
  const result = await convertHtml(`<main data-markswift-root><select id="wrapped"><div>
    <option value="first">A</option><option value="second" selected><span>B </span>label</option>
  </div></select></main>`, { name: "WrappedSelect" });
  const choice = controls(result).get("#wrapped")!;
  expect(choice.choices?.map(option => [option.id, option.value, option.label])).toEqual([[0, "first", "A"], [1, "second", "B label"]]);
  expect(choice.selectedChoice).toBe(1);
  expect(result.code).toContain("@State private var s_wrapped: Int = 1");
}, 30000);

browserTest("multiple and size selects keep selected labels and report static editing fallback", async () => {
  const result = await convertHtml(`<main data-markswift-root>
    <select id="many" multiple><option value="1" selected>First</option><option value="2">Second</option><option value="3" selected>Third</option></select>
    <select id="list" size="3"><option>One</option><option selected>Two</option></select>
  </main>`, { name: "StaticSelects", async prepare(page) {
    await page.evaluate(() => {
      const select = document.querySelector("#many") as HTMLSelectElement;
      select.options[0]!.selected = false;
      select.options[1]!.selected = true;
    });
  } });
  expect(controls(result).get("#many")?.value).toBe("Second\nThird");
  expect(controls(result).get("#list")?.value).toBe("Two");
  expect(result.code).not.toContain("@State");
  expect(result.code).not.toContain("SwiftUI.Menu");
  expect(result.code).toContain('Text(verbatim: "Second\\nThird")');
  expect(result.diagnostics.flatMap(item => item.notes).filter(note => note.includes("static selected labels"))).toHaveLength(2);
}, 30000);

nativeTest("select menus and static multi-select fallbacks compile in app and fidelity modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-select-native-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const html = choicesHtml.replace("</main>", '<select><option hidden selected>Hidden selected</option><option style="display:none">Hidden CSS</option><option>Visible</option></select><select multiple><option selected>One</option><option selected>Two</option></select></main>');
      const result = await convertHtml(html, { name: "Menu", mode });
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const check = await typecheck(output);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
