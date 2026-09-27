import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function byId(node: LayoutNode, id: string): LayoutNode | undefined {
  return node.attrs.id === id ? node : node.children.map(child => byId(child, id)).find(Boolean);
}

browserTest("cascaded layout intent survives pixel resolution and serialized layout consumers", async () => {
  const result = await convertHtml(`<main data-markswift-root style="width:320px">
    <div id="tracks"><div>A</div><div>B</div><div>C</div></div>
    <div id="flex"><div id="basis">Base</div><div id="auto-margin">Grow</div></div>
    <table id="table"><colgroup><col id="column"><col></colgroup><tbody><tr><td>A</td><td>B</td></tr></tbody></table>
  </main>`, { name: "CascadedIntent", css: `
    #tracks {display:grid;grid-template-columns:64px 1fr 2fr;gap:8px}
    #flex {display:flex} #basis {flex:2 1 30px}
    #auto-margin {margin-left:auto}
    #table {table-layout:fixed;width:100%;border-collapse:separate;border-spacing:3px 5px;caption-side:bottom}
    #column {width:25%;background:#ff0000}
  ` });
  const layout = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)));
  const grid = byId(layout.root, "tracks")!;
  expect(grid.preferredSize?.gridTemplateColumns).toBe("64px 1fr 2fr");
  expect(grid.styles["grid-template-columns"]).toMatch(/px/);
  expect(grid.styles["grid-template-columns"]).not.toContain("fr");
  expect(byId(layout.root, "basis")!.preferredSize?.flexBasis).toBe("30px");
  expect(byId(layout.root, "auto-margin")!.preferredSize?.hasAutoMargins).toBe(true);
  expect(byId(layout.root, "column")!.preferredSize?.width).toBe("25%");
  expect(byId(layout.root, "column")!.styles["background-color"]).toBe("rgb(255, 0, 0)");
  expect(byId(layout.root, "column")!.preferredSize).not.toHaveProperty("columnStyles");
  expect(byId(layout.root, "table")!.styles).toMatchObject({ "border-collapse": "separate", "border-spacing": "3px 5px", "caption-side": "bottom" });
}, 30000);

browserTest("open shadow and slotted layout intent uses the same composed paths as the snapshot", async () => {
  const result = await convertHtml(`<main data-markswift-root><div id="host"><div id="slotted" style="width:50%">Slot</div></div></main>`, {
    name: "ShadowIntent", async prepare(page) {
      await page.evaluate(() => {
        document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML =
          '<div id="shadow-grid" style="display:grid;grid-template-columns:40px minmax(0,1fr)"><div>A</div><slot></slot></div>';
      });
    },
  });
  expect(byId(result.layout.root, "shadow-grid")!.preferredSize?.gridTemplateColumns).toBe("40px minmax(0px, 1fr)");
  expect(byId(result.layout.root, "slotted")!.preferredSize?.width).toBe("50%");
}, 30000);
