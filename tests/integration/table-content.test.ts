import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { SemNode, StackNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function find<T extends LayoutNode | SemNode>(node: T, id: string): T | undefined {
  if (node.id === `#${id}` || ("attrs" in node && node.attrs.id === id)) return node;
  for (const child of "children" in node ? node.children : []) { const result = find(child as T, id); if (result) return result; }
}
const css = `body{margin:0;font:16px system-ui}table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0}
th,td{text-align:left;padding:8px;border-bottom:1px solid #888}th{font-weight:600}p{margin:0}`;

browserTest("rowspan text has one measured normal line within its separately observed cell at two widths", async () => {
  for (const width of [320, 390]) for (const alignment of ["top", "middle", "bottom"]) {
    const html = `<style>${css}#scope{vertical-align:${alignment}}</style><table id="table"><tbody>
      <tr><th rowspan="2" id="scope">Scope</th><td>Capture</td></tr><tr><td>Compile</td></tr></tbody></table>`;
    const result = await convertHtml(html, { name: "SpanContent", viewport: { width, height: 400 } });
    const table = find(inferScreen(result.layout, "SpanContent").root, "table") as StackNode;
    const source = find(result.layout.root, "scope")!, index = table.children.findIndex(child => child.id === "#scope"), cell = table.children[index]!;
    expect(cell.frame).toEqual(source.bounds);
    expect(table.table!.placements[index]!.contentFrame!.h).toBeCloseTo(35, 1);
    if (cell.kind !== "text") throw new Error("Expected span text");
    expect(cell.lineBox!.baselineStep).toBeCloseTo(18, 1);
    const text = source.children.find(child => child.tag === "#text")!;
    expect(cell.frame.y + cell.padding[0] + cell.lineBox!.firstBaseline).toBeCloseTo(text.firstBaseline!, 1);
    const fidelity = compileLayout(result.layout, { name: "SpanContent", mode: "fidelity" });
    expect(fidelity.code).toContain("fixedHeight: 18.0");
  }
}, 120000);

browserTest("inline cell buttons remove captured middle slack and emitted table bundles typecheck", async () => {
  const html = `<style>${css}button{font:inherit;padding:8px 12px;border:1px solid #888}td p{margin:4px 0 0;font-size:12px;line-height:17px}</style>
    <table id="table"><tbody><tr><td><strong>Component</strong><p>Description</p></td><td id="action"><button id="open">Open</button></td></tr></tbody></table>`;
  const result = await convertHtml(html, { name: "CellAction", viewport: { width: 390, height: 400 } });
  const cell = find(inferScreen(result.layout, "CellAction").root, "action") as StackNode;
  const source = find(result.layout.root, "action")!, button = find(result.layout.root, "open")!;
  expect(button.bounds.y - source.bounds.y - 8).toBeGreaterThan(0);
  expect(cell.frame).toEqual(source.bounds);
  expect(cell.leadInset).toBe(0);
  expect(cell.padding).toEqual([8, 8, 9, 8]);
  if (process.env.MARKSWIFT_SWIFT_TESTS === "1") for (const mode of ["app", "fidelity"] as const) {
    const directory = await mkdtemp(join(tmpdir(), "markswift-table-content-"));
    try {
      const bundle = compileLayout(result.layout, { name: "CellAction", mode });
      for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
      const check = await typecheck(directory);
      expect(check.ok, check.output).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}, 120000);

browserTest("collapsed table text rebases measured baselines across half-border padding", async () => {
  const html = `<style>${css}table{border-collapse:collapse}th,td{border:2px solid #888;padding:5px 7px 11px 13px}</style>
    <table id="table"><tbody><tr><th rowspan="2" id="scope">Scope</th><td>Capture</td></tr><tr><td>Compile</td></tr></tbody></table>`;
  const result = await convertHtml(html, { name: "CollapsedContent", viewport: { width: 390, height: 400 } });
  const table = find(inferScreen(result.layout, "CollapsedContent").root, "table") as StackNode;
  const cell = find<SemNode>(table, "scope")!;
  expect(table.table).toBeDefined();
  expect(cell.padding).toEqual([6, 8, 12, 14]);
  if (cell.kind !== "text") throw new Error("Expected span text");
  const text = find(result.layout.root, "scope")!.children[0]!;
  expect(cell.frame.y + cell.padding[0] + cell.lineBox!.firstBaseline).toBeCloseTo(text.firstBaseline!, 1);
  const output = compileLayout(result.layout, { name: "CollapsedContent", mode: "fidelity" });
  expect(output.code).toContain("firstBaseline: 15.0, baselineToBottom: 3.0, baselineStep: 18.0");
}, 60000);
