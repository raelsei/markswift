import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("simple block percentage widths retain their parent-relative intent in app mode", async () => {
  const html = `<!doctype html><style>html,body{margin:0}</style>
    <main data-markswift-root style="width:100%"><div id="half" style="width:50%;height:30px;background:red"></div></main>`;
  const wide = await convertHtml(html, { name: "RelativeWidth", viewport: { width: 390, height: 100 } });
  const narrow = await convertHtml(html, { name: "RelativeWidth", viewport: { width: 320, height: 100 } });
  const fidelity = await convertHtml(html, { name: "RelativeWidth", mode: "fidelity", viewport: { width: 390, height: 100 } });

  expect(wide.layout.root.children[0]?.preferredSize?.width).toBe("50%");
  expect(wide.layout.root.children[0]?.bounds.w).toBe(195);
  expect(narrow.layout.root.children[0]?.bounds.w).toBe(160);
  expect(wide.code).toContain(".modifier(MarkswiftRelativeWidth(fraction: 0.5, capturedWidth: 195.0))");
  expect(wide.files["MarkswiftRuntime.swift"]).toContain("struct MarkswiftRelativeWidthLayout: Layout");
  expect(fidelity.code).toContain(".frame(width: 195.0");
  expect(fidelity.code).not.toContain(".modifier(MarkswiftRelativeWidth(fraction:");
  expect(wide.diagnostics.some(item => item.notes.some(note =>
    note.includes("width: 50%") && note.includes("resize")))).toBe(false);
}, 30000);

browserTest("a percentage-sized capture root also reports its lost containing-width rule", async () => {
  const result = await convertHtml(`<style>body{margin:0}</style>
    <main data-markswift-root style="width:50%;height:30px"></main>`,
    { name: "RelativeRoot", viewport: { width: 390, height: 100 } });
  expect(result.layout.root.preferredSize?.width).toBe("50%");
  expect(result.diagnostics.some(item => item.notes.some(note => note.includes("width: 50%") && note.includes("resize")))).toBe(true);
}, 30000);

browserTest("RTL placement and captured paint geometry retain the measured-width warning", async () => {
  for (const [parentStyle, childStyle] of [
    ["width:100%;direction:rtl", "width:50%;height:30px;background:red"],
    ["width:100%", "width:50%;height:30px;background:radial-gradient(circle,red,blue)"],
  ]) {
    const result = await convertHtml(`<style>html,body{margin:0}</style>
      <main data-markswift-root style="${parentStyle}"><div style="${childStyle}"></div></main>`,
      { name: "RelativeFallback", viewport: { width: 390, height: 100 } });
    expect(result.code).not.toContain(".modifier(MarkswiftRelativeWidth(fraction:");
    expect(result.diagnostics.some(item => item.notes.some(note =>
      note.includes("width: 50%") && note.includes("resize")))).toBe(true);
  }
}, 30000);
