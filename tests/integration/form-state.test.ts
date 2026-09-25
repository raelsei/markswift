import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

function byId(root: LayoutNode, id: string): LayoutNode {
  const found = root.children.find((child) => child.attrs.id === id);
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
