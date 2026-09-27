import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { analyzeNativeTable, tableFallbackReason } from "../../src/analysis/table-layout.ts";
import { allocateTableColumns } from "../../src/analysis/table-allocation.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { TABLE_CSS, TABLE_HTML } from "../helpers/table-fixture.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function find(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.attrs.id === id) return node;
  for (const child of node.children) { const result = find(child, id); if (result) return result; }
}

browserTest("one native table's declared allocation matches Chrome at two widths including both spans", async () => {
  const wide = await convertHtml(TABLE_HTML, { css: TABLE_CSS, name: "NativeTable", viewport: { width: 390, height: 600 } });
  const compact = await convertHtml(TABLE_HTML, { css: TABLE_CSS, name: "CompactTable", viewport: { width: 320, height: 600 } });
  const table = find(wide.layout.root, "table")!, otherTable = find(compact.layout.root, "table")!;
  const proof = analyzeNativeTable(table)!;
  expect(proof, tableFallbackReason(table)).toBeDefined();
  expect(proof.layout.columns).toEqual([{ kind: "fraction", value: 0.25 }, { kind: "fixed", value: 64 }, { kind: "auto" }]);
  for (const reference of [wide, compact]) {
    const root = find(reference.layout.root, "table")!;
    const available = root.bounds.w - proof.layout.insets[1] - proof.layout.insets[3] - 2 * proof.layout.spacing[0];
    const widths = allocateTableColumns(proof.layout.columns, available)!;
    for (const { node, placement } of proof.members.filter(member => member.placement.kind === "cell")) {
      const target = find(reference.layout.root, node.attrs.id!)!;
      const x = root.bounds.x + proof.layout.insets[3] + widths.slice(0, placement.column).reduce((a, b) => a + b, 0) + placement.column * proof.layout.spacing[0];
      const w = widths.slice(placement.column, placement.column + placement.columnSpan).reduce((a, b) => a + b, 0) + (placement.columnSpan - 1) * proof.layout.spacing[0];
      expect(Math.abs(target.bounds.x - x)).toBeLessThan(0.1);
      expect(Math.abs(target.bounds.w - w)).toBeLessThan(0.1);
    }
  }
  expect(analyzeNativeTable(otherTable)?.layout.columns).toEqual(proof.layout.columns);
  expect(wide.code).toContain("MarkswiftTableLayout(columns:");
  expect(wide.code).toContain("rowSpan: 2, columnSpan: 1");
  expect(wide.code).toContain("rowSpan: 1, columnSpan: 2");
  expect(wide.code).toContain("Footer section, Row 5, column 1");
  expect(wide.code).toContain("Grouped release checks");
}, 60000);

browserTest("native fixed tables preserve first-row px/percent intent and column-group spans", async () => {
  const cases = [
    { columns: "", first: '<th id="a" style="width:80px">A</th><th>B</th><th>C</th>', css: "" },
    { columns: "", first: '<th id="a" style="width:25%">A</th><th>B</th><th>C</th>', css: "" },
    { columns: '<colgroup span="2" style="width:20%"></colgroup>', first: '<th id="a">A</th><th>B</th><th>C</th>', css: "" },
    { columns: '<colgroup><col style="width:80px"><col style="width:160px"><col style="width:80px"></colgroup>', first: '<th id="a">A</th><th>B</th><th>C</th>', css: "" },
    { columns: "", first: '<th colspan="2" id="a" style="width:100px">A</th><th>C</th>', css: "table{border-collapse:separate;border-spacing:0}" },
  ];
  for (const item of cases) {
    const html = `<style>body{margin:0}table{table-layout:fixed;width:100%;border-collapse:collapse}th,td{padding:4px;border:1px solid;vertical-align:middle}${item.css}</style><table id="table">${item.columns}<tr>${item.first}</tr><tr><td>D</td><td>E</td><td>F</td></tr></table>`;
    const wide = await convertHtml(html, { name: "DeclaredTable", viewport: { width: 390, height: 600 } });
    const small = await convertHtml(html, { name: "DeclaredCompact", viewport: { width: 320, height: 600 } });
    const table = find(wide.layout.root, "table")!, smallTable = find(small.layout.root, "table")!;
    const proof = analyzeNativeTable(table);
    expect(proof, tableFallbackReason(table)).toBeDefined();
    const compactProof = analyzeNativeTable(smallTable);
    expect(compactProof, tableFallbackReason(smallTable)).toBeDefined();
    expect(compactProof!.layout.columns).toEqual(proof!.layout.columns);
    expect(wide.code).toContain("MarkswiftTableLayout(columns:");
  }
}, 120000);

browserTest("nested live controls and block text in cells emit complete content and paint", async () => {
  const html = `<style>body{margin:0}table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0}td{vertical-align:top;background:#eee;padding:8px}button{padding:4px}p{margin:4px 0}</style><table id="table"><tr><td><div><button>Run checks</button><p>Nested cell description</p></div></td><td>Ready</td></tr></table>`;
  const result = await convertHtml(html, { name: "NestedTable", viewport: { width: 390, height: 600 } });
  expect(result.code).toContain("MarkswiftTableLayout(columns:");
  expect(result.code).toContain("Run checks");
  expect(result.code).toContain("Nested cell description");
  expect(result.code).toContain(".accessibilityElement(children: .contain)");
  expect(result.code).not.toContain("undefined");
  if (process.env.MARKSWIFT_SWIFT_TESTS === "1") {
    for (const mode of ["app", "fidelity"] as const) {
      const directory = await mkdtemp(join(tmpdir(), "markswift-nested-table-"));
      try {
        const bundle = compileLayout(result.layout, { name: "NestedTable", mode });
        for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
        const check = await typecheck(directory);
        expect(check.ok, check.output).toBe(true);
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
}, 60000);

browserTest("hidden column declarations cannot masquerade as measured equal-column allocation", async () => {
  for (const columns of [
    '<colgroup><col style="display:none;width:80px"><col><col><col></colgroup>',
    '<colgroup style="display:none;width:80px" span="3"></colgroup>',
  ]) {
    const html = `<style>body{margin:0}table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0}td{padding:0;vertical-align:top}</style><table id="table">${columns}<tr><td id="a">A</td><td>B</td><td>C</td></tr></table>`;
    const capture = await convertHtml(html, { name: "HiddenColumn", viewport: { width: 240, height: 600 } });
    const compact = await convertHtml(html, { name: "HiddenColumnExpanded", viewport: { width: 320, height: 600 } });
    const table = find(capture.layout.root, "table")!;
    const proof = analyzeNativeTable(table)!;
    expect(proof, tableFallbackReason(table)).toBeDefined();
    expect(proof.layout.columns).toEqual([{ kind: "auto" }, { kind: "auto" }, { kind: "auto" }]);
    expect(find(capture.layout.root, "a")!.bounds.w).toBeCloseTo(80, 1);
    expect(find(compact.layout.root, "a")!.bounds.w).toBeCloseTo(320 / 3, 1);
    expect(allocateTableColumns(proof.layout.columns, 320)![0]).toBeCloseTo(320 / 3, 1);
  }
}, 60000);
