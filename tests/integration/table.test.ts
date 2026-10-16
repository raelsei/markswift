/** Plan 049: LD4 table keys are captured, admitted tables become `MarkswiftTable` grids, `<th>` is a header. */
import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { type GridNode, walk } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

const PAGE = `<main data-markswift-root style="font:14px/20px system-ui">
<style>td, th { padding:2px; border:1px solid #888 }</style>
<table id="sep" style="border-collapse:separate;border-spacing:3px 5px;width:300px;border:2px solid #000;padding:4px"><caption>Cap</caption><tr><td colspan="2">a</td><td rowspan="2">b</td></tr><tr><td>c</td><td>d</td></tr></table>
<table id="fix" style="table-layout:fixed;width:300px;border-collapse:separate;border-spacing:4px"><colgroup><col style="width:100px"><col style="width:20%"><col></colgroup><tr><td>x</td><td style="width:50px">y</td><td>z</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>
<table id="col" style="border-collapse:collapse;width:100%"><thead><tr><th>Region</th><th>Rep</th></tr></thead><tbody><tr><td>North</td><td>Ada</td></tr></tbody></table>
<table id="emp" style="empty-cells:hide;border-spacing:2px"><tr><td style="background:red"></td><td>e</td></tr></table>
</main>`;

const near = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  for (const [i, v] of a.entries()) expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(0.01);
};

browserTest(
  "tables: LD4 keys, admission, MarkswiftTable emission and header traits",
  async () => {
    const result = await convertHtml(PAGE, { mode: "app", theme: "light", viewport: { width: 390, height: 800 } });
    const byId = new Map<string, LayoutNode>();
    const cols: LayoutNode[] = [];
    const visit = (n: LayoutNode, inFix: boolean) => {
      if (n.attrs.id) byId.set(n.attrs.id, n);
      if (inFix && n.tag === "col") cols.push(n);
      for (const c of n.children) visit(c, inFix || n.attrs.id === "fix");
    };
    visit(result.layout.root, false);

    // 1. Capture (046).
    expect(byId.get("sep")!.styles["border-spacing"]).toBe("3px 5px");
    expect(byId.get("fix")!.styles["table-layout"]).toBe("fixed");
    expect(byId.get("col")!.styles["border-collapse"]).toBe("collapse");
    expect(cols.map((c) => c.preferredSize?.width)).toEqual(["100px", "20%", "auto"]);

    // 2. IR.
    const grids: GridNode[] = [];
    walk(inferScreen(result.layout, "t").root, (n) => {
      if (n.kind === "grid" && n.table) grids.push(n);
    });
    expect(grids).toHaveLength(4);
    const [sep, fix, col, emp] = grids as [GridNode, GridNode, GridNode, GridNode];
    expect([sep.columns, sep.hSpacing, sep.vSpacing, sep.table!.collapse]).toEqual([3, 3, 5, false]);
    // Columns and rows are the captured lattice (the plan's probe read 88.688 / 93.641 / 93.672 and rows of 26 under
    // another font; this page's capture differs by a few tenths, so the live boxes are the reference).
    const sepTable = byId.get("sep")!;
    const [caption, tbody] = sepTable.children as [LayoutNode, LayoutNode];
    const [tr1, tr2] = tbody.children as [LayoutNode, LayoutNode];
    const [c, d] = tr2.children as [LayoutNode, LayoutNode];
    near(sep.table!.widths, [c.bounds.w, d.bounds.w, tr1.children[1]!.bounds.w]);
    near(sep.table!.heights, [tr1.bounds.h, tr2.bounds.h]);
    expect(sep.table!.slots).toEqual([
      { rowStart: 1, colStart: 1, rowSpan: 1, colSpan: 2 },
      { rowStart: 1, colStart: 3, rowSpan: 2, colSpan: 1 },
      { rowStart: 2, colStart: 1, rowSpan: 1, colSpan: 1 },
      { rowStart: 2, colStart: 2, rowSpan: 1, colSpan: 1 },
    ]);
    expect(sep.frame).toEqual({
      x: 0,
      y: caption.bounds.h,
      w: 300,
      h: sepTable.bounds.h - caption.bounds.h,
    });
    expect(sep.padding).toEqual([6, 6, 6, 6]);
    expect(fix.table!.fixed).toEqual([
      { kind: "px", px: 100 },
      { kind: "percent", fraction: 0.2, plus: 0 },
      { kind: "auto" },
    ]);
    expect([col.hSpacing, col.table!.collapse]).toEqual([0, true]);
    expect(emp.children[0]!.style.fills).toEqual([]);

    // 3. App code.
    expect(result.code).toContain("MarkswiftTable(widths: [");
    expect(result.code).toContain(".markswiftGridCell(column: 1, row: 1, columnSpan: 2)");
    expect(result.code).toContain(".markswiftGridCell(column: 3, row: 1, rowSpan: 2)");
    expect(result.code).toContain("fixed: [.px(100.0), .percent(0.2, plus: 0.0), .auto]");

    // 4. A11y: the two `<th>`s announce as headers.
    expect(result.code.split(".accessibilityAddTraits(.isHeader)").length - 1).toBe(2);
  },
  60_000,
);
