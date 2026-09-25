import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("a display:contents custom element keeps child geometry and reports lost semantics", async () => {
  const result = await convertHtml(`<main data-h2s-root style="width:240px;height:80px">
    <profile-card id="wrapper" style="display:contents">
      <div id="inner" style="width:100px;height:24px">Visible child</div>
    </profile-card>
  </main>`, { name: "ContentsCustom" });

  const inner = result.layout.root.children.find((child) => child.attrs.id === "inner");
  expect(inner?.bounds).toEqual({ x: 0, y: 0, w: 100, h: 24 });
  expect(result.layout.root.children.some((child) => child.tag === "profile-card")).toBe(false);
  expect(result.code).toContain("Visible child");
  expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("<profile-card>");
  expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("wrapper");
}, 30000);
