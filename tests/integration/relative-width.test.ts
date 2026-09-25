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

browserTest("equal calculated flex widths share the available row width in app mode", async () => {
  const html = `<main data-markswift-root class="gallery"><div class="row"><figure><div class="tile"></div></figure><figure><div class="tile"></div></figure></div></main>`;
  const css = `*{box-sizing:border-box}body{margin:0}.gallery{width:100%;padding:20px}.row{display:flex;gap:12px}.row figure{width:calc((100% - 12px)/2);margin:0}.tile{width:100%;height:125px;border-radius:12px;background:#def}`;
  const wide = await convertHtml(html, { name: "CalculatedFlex", css, viewport: { width: 390, height: 200 } });
  const narrow = await convertHtml(html, { name: "CalculatedFlex", css, viewport: { width: 320, height: 200 } });

  expect(wide.layout.root.children[0]?.children[0]?.preferredSize?.width).toBe("calc(50% - 6px)");
  expect(wide.layout.root.children[0]?.children[0]?.bounds.w).toBe(169);
  expect(narrow.layout.root.children[0]?.children[0]?.bounds.w).toBe(134);
  expect(wide.code).not.toContain(".frame(width: 169.0");
  expect(wide.code.match(/\.frame\(maxWidth: \.infinity/g)?.length).toBeGreaterThanOrEqual(2);
  expect(wide.diagnostics.some(item => item.notes.some(note => note.includes("width: calc(50% - 6px)")))).toBe(false);
}, 30000);

browserTest("unequal flex shrink rules keep calculated widths measured with a warning", async () => {
  const html = `<style>*{box-sizing:border-box}body{margin:0}.row{display:flex;gap:12px}.row div{width:calc(50% - 6px);height:20px}.row div:first-child{flex-shrink:2}</style>
    <main data-markswift-root style="width:100%"><div class="row"><div>A</div><div>B</div></div></main>`;
  const result = await convertHtml(html, { name: "UnequalShrink", viewport: { width: 390, height: 100 } });
  expect(result.code).toContain(".frame(width: 189.0");
  expect(result.diagnostics.some(item => item.notes.some(note => note.includes("width: calc(50% - 6px)") && note.includes("resize")))).toBe(true);
}, 30000);

browserTest("a calc rule that fills only at capture width does not become equal native tracks", async () => {
  const html = `<style>*{box-sizing:border-box}body{margin:0}.row{display:flex;gap:12px}.row div{width:calc(40% + 29px);height:20px;flex-shrink:0}</style>
    <main data-markswift-root style="width:100%;padding:20px"><div class="row"><div>A</div><div>B</div></div></main>`;
  const wide = await convertHtml(html, { name: "IncidentalFill", viewport: { width: 390, height: 100 } });
  expect(wide.layout.root.children[0]?.bounds.w).toBe(350);
  expect(wide.code).toContain(".frame(width: 169.0");
  expect(wide.diagnostics.some(item => item.notes.some(note => note.includes("width: calc(40% + 29px)") && note.includes("resize")))).toBe(true);
}, 30000);

browserTest("explicit flex min width keeps a calc track measured at the wider capture", async () => {
  const html = `<style>*{box-sizing:border-box}body{margin:0}.row{display:flex;gap:12px}.row figure{width:calc(50% - 6px);height:20px;margin:0}.row figure:first-child{min-width:150px}</style>
    <main data-markswift-root style="width:100%;padding:20px"><div class="row"><figure>A</figure><figure>B</figure></div></main>`;
  const wide = await convertHtml(html, { name: "ConstrainedFlex", viewport: { width: 390, height: 100 } });
  const narrow = await convertHtml(html, { name: "ConstrainedFlex", viewport: { width: 320, height: 100 } });
  expect(wide.layout.root.children[0]?.children[0]?.bounds.w).toBe(169);
  expect(narrow.layout.root.children[0]?.children[0]?.bounds.w).toBe(150);
  expect(wide.code).toContain(".frame(width: 169.0");
  expect(wide.diagnostics.some(item => item.notes.some(note => note.includes("width: calc(50% - 6px)") && note.includes("resize")))).toBe(true);
}, 30000);
