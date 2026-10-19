import { expect, test } from "bun:test";
import { tableCellContext, applyTableCellContext } from "../../../src/analysis/table-accessibility.ts";
import { tableSlots } from "../../../src/analysis/table.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { table, doc } from "../../helpers/tables.ts";

const fixture = () =>
  table({
    widths: [100, 100],
    heights: [24, 24, 24],
    cells: [
      { row: 0, col: 0, tag: "th", text: "Name", attrs: { id: "name", scope: "col" } },
      { row: 0, col: 1, tag: "th", text: "Total", attrs: { id: "total", scope: "col" } },
      { row: 1, col: 0, tag: "th", text: "North", attrs: { id: "north", scope: "row" } },
      { row: 1, col: 1, text: "42" },
      { row: 2, col: 0, text: "Combined", colSpan: 2, attrs: { headers: "total name total missing" } },
    ],
  });

test("table context resolves scoped headers, explicit headers, spans and dimensions", () => {
  const slots = tableSlots(fixture())!;
  expect(slots).toBeDefined();
  expect(tableCellContext(slots.cells[3]!, slots)).toEqual({
    row: 2,
    column: 2,
    rowSpan: 1,
    columnSpan: 1,
    rows: 3,
    columns: 2,
    headers: ["Total", "North"],
  });
  expect(tableCellContext(slots.cells[4]!, slots)).toMatchObject({ columnSpan: 2, headers: ["Total", "Name"] });
  slots.cells[3]!.node.attrs.headers = "";
  expect(tableCellContext(slots.cells[3]!, slots).headers).toEqual([]);
});

test("simple unscoped headers are exposed without changing cell labels or fidelity paint", () => {
  const t = fixture();
  const slots = tableSlots(t)!;
  slots.cells[0]!.node.attrs = {};
  slots.cells[1]!.node.attrs = {};
  const output = compileLayout(doc(t), { name: "Report", mode: "app" });
  expect(output.code).toContain('.accessibilityCustomContent("Row", "2 of 3", importance: .high)');
  expect(output.code).toContain('.accessibilityCustomContent("Column", "1–2 of 2", importance: .high)');
  expect(output.code).toContain('.accessibilityCustomContent("Headers", "Total, North", importance: .high)');
  expect(output.code).toContain('Text(verbatim: "42")');
  expect(compileLayout(doc(t), { name: "Report", mode: "fidelity" }).code).not.toContain(".accessibilityCustomContent");
});

test("a nested table retains its own context", () => {
  const grid = inferScreen(doc(fixture()), "Report").root;
  const before = JSON.stringify(grid);
  applyTableCellContext(grid, {
    row: 99,
    column: 99,
    rowSpan: 1,
    columnSpan: 1,
    rows: 99,
    columns: 99,
    headers: ["Outer"],
  });
  expect(JSON.stringify(grid)).toBe(before);
});

test("native cell identities stay distinct when a saved table has no node IDs", () => {
  const code = compileLayout(doc(fixture()), { name: "Report", mode: "app" }).code;
  const ids = [...code.matchAll(/MarkswiftAccessibleCell\(id: "([^"]+)"/g)].map((m) => m[1]);
  expect(ids).toHaveLength(5);
  expect(new Set(ids).size).toBe(5);
});

test("row-group headers cover their group without changing the header cell's span", () => {
  const t = fixture();
  const slots = tableSlots(t)!;
  slots.cells[2]!.node.attrs.scope = "rowgroup";
  const code = compileLayout(doc(t), { name: "Report", mode: "app" }).code;
  expect(code).toContain('rowSpan: 1, columnSpan: 1, header: "row", headerRows: [1, 2, 3]');
});
