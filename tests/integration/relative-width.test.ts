import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("percentage widths measured at capture size report their resize limitation", async () => {
  const html = `<!doctype html><style>html,body{margin:0}</style>
    <main data-markswift-root style="width:100%"><div id="half" style="width:50%;height:30px"></div></main>`;
  const wide = await convertHtml(html, { name: "RelativeWidth", viewport: { width: 390, height: 100 } });
  const narrow = await convertHtml(html, { name: "RelativeWidth", viewport: { width: 320, height: 100 } });

  expect(wide.layout.root.children[0]?.preferredSize?.width).toBe("50%");
  expect(wide.layout.root.children[0]?.bounds.w).toBe(195);
  expect(narrow.layout.root.children[0]?.bounds.w).toBe(160);
  expect(wide.diagnostics.some(item => item.notes.some(note =>
    note.includes("width: 50%") && note.includes("resize")))).toBe(true);
}, 30000);

browserTest("a percentage-sized capture root also reports its lost containing-width rule", async () => {
  const result = await convertHtml(`<style>body{margin:0}</style>
    <main data-markswift-root style="width:50%;height:30px"></main>`,
    { name: "RelativeRoot", viewport: { width: 390, height: 100 } });
  expect(result.layout.root.preferredSize?.width).toBe("50%");
  expect(result.diagnostics.some(item => item.notes.some(note => note.includes("width: 50%") && note.includes("resize")))).toBe(true);
}, 30000);
