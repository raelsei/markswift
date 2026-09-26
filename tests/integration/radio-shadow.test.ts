import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { walk, type ControlNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("radio ownership preserves open shadow and slot scopes, and leaves closed roots unproven", async () => {
  const result = await convertHtml(`<main data-markswift-root>
    <form id="light"><div id="slot-host"><input id="slotted" type="radio" name="same"></div></form>
    <div id="owned-host"></div>
    <div id="closed-host"><input id="hidden-light" type="radio" name="same" form="light"></div>
    <input id="document-free" type="radio" name="same">
  </main>`, {
    name: "ShadowRadios",
    async prepare(page) {
      await page.evaluate(() => {
        document.querySelector("#slot-host")!.attachShadow({ mode: "open" }).innerHTML =
          '<input id="open-free" type="radio" name="same"><slot></slot>';
        document.querySelector("#owned-host")!.attachShadow({ mode: "open" }).innerHTML =
          '<form><input id="open-owned-a" type="radio" name="same"><input id="open-owned-b" type="radio" name="same"></form>';
        document.querySelector("#closed-host")!.attachShadow({ mode: "closed" }).innerHTML =
          '<input id="closed-free" type="radio" name="same">';
      });
    },
  });
  const inputs = new Map<string, LayoutNode>();
  const collect = (node: LayoutNode) => {
    if (node.tag === "input") inputs.set(node.attrs.id!, node);
    node.children.forEach(collect);
  };
  collect(result.layout.root);
  expect(inputs.has("hidden-light")).toBe(false);
  for (const id of ["slotted", "open-free", "open-owned-a", "open-owned-b", "document-free"]) {
    expect(inputs.get(id)!.formOwner).toBeDefined();
  }
  expect(inputs.get("open-owned-a")!.formOwner).toBe(inputs.get("open-owned-b")!.formOwner);
  expect(inputs.get("slotted")!.formOwner).not.toBe(inputs.get("open-free")!.formOwner);
  expect(inputs.get("open-free")!.formOwner).not.toBe(inputs.get("document-free")!.formOwner);
  expect(inputs.get("closed-free")!.formOwner).toBeUndefined();
  const controls = new Map<string, ControlNode>();
  walk(inferScreen(result.layout, "ShadowRadios").root, node => {
    if (node.kind === "control" && node.control === "radio") controls.set(node.id, node);
  });
  expect(controls.get("#closed-free")!.radioGroup).toBeUndefined();
  expect(controls.get("#closed-free")!.notes.join(" ")).toContain("no form ownership metadata");
}, 30_000);
