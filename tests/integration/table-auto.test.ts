import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { analyzeNativeTable, tableFallbackReason } from "../../src/analysis/table-layout.ts";
import { intrinsicTableCells, allocateIntrinsicTableColumns } from "../../src/analysis/table-intrinsic.ts";
import { readTableStructure } from "../../src/analysis/table-structure.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { AUTO_TABLE_CSS, AUTO_TABLE_HTML } from "../helpers/table-auto-fixture.ts";
import { nativeIntrinsicWidths } from "../helpers/table-native-intrinsic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function find(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.attrs.id === id) return node;
  for (const child of node.children) { const value = find(child, id); if (value) return value; }
}

browserTest("one 390 capture's automatic rules match independent Chrome and emitted CoreText at 320/390/500", async () => {
  const references = [];
  for (const width of [390, 320, 500]) references.push(await convertHtml(AUTO_TABLE_HTML, { css: AUTO_TABLE_CSS, name: "AutomaticTable", viewport: { width, height: 600 } }));
  const capturedTable = find(references[0]!.layout.root, "auto-table")!;
  const proof = analyzeNativeTable(capturedTable)!;
  expect(proof, tableFallbackReason(capturedTable)).toBeDefined();
  expect(proof.layout.mode).toBe("auto");
  expect(references[0]!.code).toContain("intrinsic: [");
  const structure = readTableStructure(capturedTable, () => undefined)!;
  const maximums = intrinsicTableCells(structure, false, {}, () => undefined)!.browserMaximums;
  const overhead = proof.layout.insets[1] + proof.layout.insets[3] + 2 * proof.layout.spacing[0];
  const native = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? await nativeIntrinsicWidths(proof.layout, [390, 320, 500]) : undefined;
  for (const [index, reference] of references.entries()) {
    const table = find(reference.layout.root, "auto-table")!;
    expect(analyzeNativeTable(table)?.layout.intrinsic).toEqual(proof.layout.intrinsic);
    const widths = allocateIntrinsicTableColumns(maximums, table.bounds.w - overhead);
    for (const { node, placement } of proof.members.filter(member => member.placement.kind === "cell")) {
      const actual = find(reference.layout.root, node.attrs.id!)!;
      const x = table.bounds.x + proof.layout.insets[3] + widths.slice(0, placement.column).reduce((a, b) => a + b, 0) + placement.column * proof.layout.spacing[0];
      expect(Math.abs(actual.bounds.x - x)).toBeLessThan(0.1);
      expect(Math.abs(actual.bounds.w - widths[placement.column]!)).toBeLessThan(0.1);
      if (native) {
        expect(Math.abs(actual.bounds.w - native.widths[index]![placement.column]!)).toBeLessThan(0.8);
        const nativeX = table.bounds.x + proof.layout.insets[3] + native.widths[index]!.slice(0, placement.column).reduce((a, b) => a + b, 0) + placement.column * proof.layout.spacing[0];
        expect(Math.abs(actual.bounds.x - nativeX)).toBeLessThan(0.8);
      }
    }
  }
}, 60000);

browserTest("nowrap automatic strings preserve space, slash and hyphen without widening the admission grammar", async () => {
  const html = `<table id="auto-table"><tr><td id="a">Not ready</td><td id="b">EU/US</td><td id="c">12-20</td></tr></table>`;
  const css = `${AUTO_TABLE_CSS}td{white-space:nowrap}`;
  for (const width of [320, 390, 500]) {
    const reference = await convertHtml(html, { css, name: "NowrapTable", viewport: { width, height: 600 } });
    const table = find(reference.layout.root, "auto-table")!;
    expect(analyzeNativeTable(table), tableFallbackReason(table)).toBeDefined();
    expect(reference.code).toContain(".fixedSize(horizontal: true, vertical: true)");
  }
}, 60000);
