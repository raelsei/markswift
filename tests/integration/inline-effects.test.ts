import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { SemNode, TextNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function flatten(node: SemNode): SemNode[] {
  const children = "children" in node ? node.children : node.kind === "control" ? node.content : [];
  return [node, ...children.flatMap(flatten), ...node.overlays.flatMap(overlay => flatten(overlay.node))];
}
function text(nodes: SemNode[], id: string): TextNode {
  const node = nodes.find(node => node.id === id && node.kind === "text");
  if (!node || node.kind !== "text") throw new Error("Missing text " + id);
  return node;
}

browserTest("hidden merged text keeps its measured space without glyph paint, gradient, decoration or navigation", async () => {
  const result = await convertHtml(`<main data-markswift-root style="width:390px;font:16px system-ui">
    <p id="hidden">Before <a id="hidden-link" href="https://example.com/secret" style="visibility:hidden;text-decoration:underline red;text-shadow:1px 1px 2px red;background:linear-gradient(red,blue);background-clip:text;color:transparent">Secret</a> After</p>
    <p id="override"><span id="hidden-box" style="visibility:hidden;background:red;opacity:.5">Invisible <em id="visible-box" style="visibility:visible;background:blue;color:white">Restored</em></span></p>
  </main>`, { name: "InlineVisibility" });
  const nodes = flatten(inferScreen(result.layout, "InlineVisibility").root);
  const hidden = text(nodes, "#hidden").runs.find(run => run.text.includes("Secret"))!;
  expect(hidden.text.trim()).toBe("Secret");
  expect(hidden.color.a).toBe(0);
  for (const property of ["paint", "decoration", "shadow", "href"] as const) expect(hidden[property]).toBeUndefined();
  expect(text(nodes, "#hidden").runs.map(run => run.text).join("")).toBe("Before Secret After");
  const override = text(nodes, "#override");
  expect(override.runs.find(run => run.text.includes("Invisible"))!.color.a).toBe(0);
  expect(override.runs.find(run => run.text.includes("Restored"))!.color.a).toBe(0.5);
  const boxes = override.overlays.map(overlay => overlay.node);
  expect(boxes.find(box => box.id === "#hidden-box#box")?.style.hidden).toBe(true);
  const visibleBox = boxes.find(box => box.id === "#visible-box#box")!;
  expect(visibleBox.style.hidden).not.toBe(true);
  expect(visibleBox.style.opacity).toBe(0.5);
  for (const mode of ["app", "fidelity"] as const) {
    const compiled = compileLayout(result.layout, { name: "InlineVisibility", mode });
    expect(compiled.code).toContain('Text(verbatim: "Secret")');
    expect(compiled.code).not.toContain("https://example.com/secret");
  }
}, 30_000);

browserTest("nested inline opacity reaches glyph and box paints once while the host retains its own effects", async () => {
  const result = await convertHtml(`<p data-markswift-root id="opacity" style="width:390px;font:16px system-ui;opacity:.4;filter:blur(1px)">Normal <span id="half" style="opacity:.5;background:red">Half <b id="quarter" style="opacity:.5;background:blue">Quarter</b></span></p>`, { name: "InlineOpacity" });
  const node = text(flatten(inferScreen(result.layout, "InlineOpacity").root), "#opacity");
  expect(node.style.opacity).toBe(0.4);
  expect(node.style.blur).toBe(1);
  expect(node.runs.find(run => run.text.includes("Normal"))!.color.a).toBe(1);
  expect(node.runs.find(run => run.text.includes("Half"))!.color.a).toBe(0.5);
  expect(node.runs.find(run => run.text.includes("Quarter"))!.color.a).toBe(0.25);
  expect(node.overlays.find(overlay => overlay.node.id === "#half#box")?.node.style.opacity).toBe(0.5);
  expect(node.overlays.find(overlay => overlay.node.id === "#quarter#box")?.node.style.opacity).toBe(0.25);
  expect(result.diagnostics.flatMap(item => item.notes).some(note => note.includes("inline filter"))).toBe(false);
  expect(result.diagnostics.flatMap(item => item.notes).some(note => note.includes("not composited as a CSS group"))).toBe(true);
}, 30_000);

browserTest("unsupported merged effects and host visibility override are diagnosed on the affected host", async () => {
  const result = await convertHtml(`<main data-markswift-root style="width:390px;font:16px system-ui">
    <p id="effects"><span style="filter:blur(3px);mask-image:linear-gradient(black,transparent);clip-path:circle(50%);mix-blend-mode:multiply">Effects</span></p>
    <p id="host-hidden" style="visibility:hidden"><span style="visibility:visible">Cannot restore this host</span></p>
  </main>`, { name: "InlineLimits" });
  const notes = result.diagnostics.find(item => item.id === "#effects")!.notes;
  for (const property of ["filter", "mask-image", "clip-path", "mix-blend-mode"]) {
    expect(notes.filter(note => note.includes("inline " + property))).toHaveLength(1);
  }
  expect(result.diagnostics.find(item => item.id === "#host-hidden")?.notes.some(note => note.includes("hidden text host remains hidden"))).toBe(true);
}, 30_000);
