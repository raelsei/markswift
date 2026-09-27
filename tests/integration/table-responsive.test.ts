import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { SemNode } from "../../src/model/semantic.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

function find(node: SemNode, id: string): SemNode | undefined {
  if (node.id === `#${id}`) return node;
  if (node.kind === "stack" || node.kind === "grid") {
    for (const child of node.children) {
      const found = find(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findLayout(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.attrs.id === id) return node;
  for (const child of node.children) {
    const found = findLayout(child, id);
    if (found) return found;
  }
  return undefined;
}

function page(rule: string, cells: string): string {
  return `<!doctype html><html><head><style>
    body { margin: 0; font: 16px Arial, sans-serif; }
    table { table-layout: fixed; width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #333; padding: 4px; }
    ${rule}
  </style></head><body><table id="table"><tbody>${cells}</tbody></table></body></html>`;
}

const rectangular = '<tr><th id="a">Alpha</th><th id="b">Beta</th><th id="c">Gamma</th></tr>' +
  '<tr><td id="d">One</td><td id="e">Two</td><td id="f">Three</td></tr>';

browserTest("equal fixed-table columns emit live widths from one 390px capture", async () => {
  const result = await convertHtml(page("", rectangular), { name: "ResponsiveTable", viewport: { width: 390, height: 600 } });
  const screen = inferScreen(result.layout, "table");
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    expect(find(screen.root, id)?.width).toEqual({ kind: "fill" });
  }
  expect(result.code).toContain(".frame(maxWidth: .infinity");
  expect(result.code).not.toContain("width: 129.66");
  const reference = await convertHtml(page("", rectangular), { name: "ReferenceTable", viewport: { width: 320, height: 600 } });
  expect(findLayout(reference.layout.root, "a")?.bounds.w).toBeGreaterThan(100);
  expect(findLayout(reference.layout.root, "a")?.bounds.w).toBeLessThan(110);
  expect(result.diagnostics.find((item) => item.id === "#table")?.confidence).toBe("approximated");
}, 60000);

browserTest("irregular spans, irregular rows and breakable automatic cells keep captured widths", async () => {
  for (const [rule, cells] of [
    ["", rectangular.replace('<th id="a"', '<th colspan="2" id="a"')],
    ["", rectangular.replace('<td id="f">Three</td>', "")],
    ["table { table-layout: auto; }", rectangular.replace("Alpha", "Alpha checks")],
    ["table { max-width: 300px; }", rectangular],
  ] as Array<[string, string]>) {
    const result = await convertHtml(page(rule, cells), { name: "GuardedTable", viewport: { width: 390, height: 600 } });
    const screen = inferScreen(result.layout, "guarded");
    expect(find(screen.root, "a")?.width.kind).toBe("fixed");
    expect(result.diagnostics.find((item) => item.id === "#table")?.confidence).toBe("approximated");
  }
}, 120000);

browserTest("a colgroup retains explicit widths in a native table allocation", async () => {
  const html = page("", rectangular).replace('<tbody>', '<colgroup><col width="80"><col><col></colgroup><tbody>');
  const result = await convertHtml(html, { name: "ColgroupTable", viewport: { width: 390, height: 600 } });
  const screen = inferScreen(result.layout, "colgroup");
  expect(find(screen.root, "a")?.width.kind).toBe("fill");
  const table = find(screen.root, "table");
  expect(table?.kind === "stack" ? table.table?.columns : undefined).toEqual([{ kind: "fixed", value: 80 }, { kind: "auto" }, { kind: "auto" }]);
  expect(result.code).toContain("MarkswiftTableLayout(columns:");
  expect(result.diagnostics.find((item) => item.id === "#table")?.confidence).toBe("approximated");
}, 30000);

browserTest("ordinary full-width top and bottom captions retain equal live table columns", async () => {
  for (const side of ["top", "bottom"] as const) {
    const html = page(`caption { caption-side: ${side}; text-align: left; margin: 6px 0; }`, rectangular)
      .replace("<tbody>", '<caption id="caption">Release checklist</caption><tbody>');
    const result = await convertHtml(html, { name: "CaptionedTable", viewport: { width: 390, height: 600 } });
    const screen = inferScreen(result.layout, "captioned");
    for (const id of ["caption", "a", "b", "c", "d", "e", "f"]) {
      expect(find(screen.root, id)?.width).toEqual({ kind: "fill" });
    }
    const caption = findLayout(result.layout.root, "caption")!;
    const table = findLayout(result.layout.root, "table")!;
    expect(caption.bounds.w).toBeCloseTo(table.bounds.w, 1);
    const tableNode = find(screen.root, "table")!;
    if (tableNode.kind !== "stack") throw new Error("Expected captured table stack");
    expect(tableNode.table?.captionSide).toBe(side);
    expect(tableNode.children.find(child => child.id === "#caption")?.id).toBe("#caption");
    expect(result.code).toContain("Release checklist");
    expect(result.code).not.toContain("width: 129.66");
    expect(result.diagnostics.find(item => item.id === "#table")?.confidence).toBe("approximated");
    const compact = await convertHtml(html, { name: "CaptionedCompact", viewport: { width: 320, height: 600 } });
    expect(findLayout(compact.layout.root, "caption")?.bounds.w).toBeCloseTo(320, 1);
    expect(findLayout(compact.layout.root, "a")?.bounds.w).toBeLessThan(110);
  }
}, 120000);

browserTest("constrained or positioned captions keep captured cell widths", async () => {
  for (const rule of ["width: 200px", "max-width: 300px", "margin-left: 10px", "position: relative"]) {
    const html = page(`caption { ${rule}; }`, rectangular)
      .replace("<tbody>", '<caption id="caption">Release checklist</caption><tbody>');
    const result = await convertHtml(html, { name: "GuardedCaption", viewport: { width: 390, height: 600 } });
    expect(find(inferScreen(result.layout, "guarded-caption").root, "a")?.width.kind).toBe("fixed");
    expect(result.diagnostics.find(item => item.id === "#table")?.confidence).toBe("approximated");
  }
}, 120000);
