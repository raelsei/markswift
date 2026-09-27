import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { restoreTableCellFlow, tableCellInsets } from "../../../src/analysis/table-content.ts";
import { tableFixture } from "../../helpers/table-fixture.ts";
import type { StackNode } from "../../../src/model/semantic.ts";

function spanningText() {
  const doc = tableFixture(), source = doc.root.children[0]!.children[2]!.children[0]!.children[0]!;
  Object.assign(source.styles, { "vertical-align": "middle", "font-family": "system-ui", "font-size": "16px", "font-weight": "600",
    "line-height": "normal", "padding-top": "8px", "padding-right": "8px", "padding-bottom": "8px", "padding-left": "8px",
    "border-bottom-width": "1px", "border-bottom-style": "solid" });
  const text = source.children[0]!;
  text.text = "Scope";
  text.bounds = { x: source.bounds.x + 8, y: source.bounds.y + 20.5, w: 46, h: 18 };
  text.firstBaseline = text.bounds.y + 15;
  text.lines = [{ bounds: text.bounds, start: 0, length: 5, baseline: text.firstBaseline }];
  return { doc, source, text };
}

test("a middle rowspan retains its outer paint and resolves normal from its measured line", () => {
  const { doc, source, text } = spanningText();
  const screen = inferScreen(doc, "SpanContent");
  if (screen.root.kind !== "stack") throw new Error("Expected page");
  const table = screen.root.children[0] as StackNode;
  const index = table.children.findIndex(child => child.id === source.id), cell = table.children[index]!;
  const placement = table.table!.placements[index]!;
  expect(cell.frame).toEqual(source.bounds);
  expect(cell.padding).toEqual([8, 8, 9, 8]);
  expect(placement.contentFrame).toEqual({ ...source.bounds, y: text.bounds.y - 8, h: 35 });
  if (cell.kind !== "text") throw new Error("Expected cell text");
  expect(cell.frame.y + cell.padding[0] + cell.lineBox!.firstBaseline).toBe(text.firstBaseline!);
  const fidelity = compileLayout(doc, { name: "SpanContent", mode: "fidelity" });
  expect(fidelity.code).toContain("CGRect(x: 0.0, y: 38.0, width: 97.5, height: 60.0)");
  expect(fidelity.code).toContain("firstBaseline: 15.0, baselineToBottom: 3.0, baselineStep: 18.0");
  expect(fidelity.code).toContain("fixedHeight: 18.0");
  expect(fidelity.code).not.toContain("bottom: 42.8");
});

test("legacy rowspan text keeps the measured line and existing font diagnostics without baseline admission", () => {
  const { doc, source, text } = spanningText();
  delete text.firstBaseline; delete text.lines;
  source.styles["font-family"] = "Unbundled Example";
  const screen = inferScreen(doc, "LegacySpan");
  if (screen.root.kind !== "stack") throw new Error("Expected page");
  const table = screen.root.children[0] as StackNode;
  const index = table.children.findIndex(child => child.id === source.id), cell = table.children[index]!;
  expect(table.table!.placements[index]!.contentFrame?.h).toBe(35);
  if (cell.kind !== "text") throw new Error("Expected cell text");
  expect(cell.lineBox).toBeUndefined();
  expect(cell.notes.some(note => note.includes("font-family"))).toBe(true);
});

test("restoring table flow removes alignment slack while retaining authored end margins", () => {
  const { doc, source } = spanningText();
  const screen = inferScreen(doc, "CellMargin");
  if (screen.root.kind !== "stack") throw new Error("Expected page");
  const table = screen.root.children[0] as StackNode, leaf = table.children.find(child => child.id === source.id)!;
  const first = { ...source, id: "first", styles: { "margin-top": "6px" }, children: [] };
  const last = { ...source, id: "last", styles: { "margin-bottom": "4px" }, children: [] };
  const cell: StackNode = { ...leaf, kind: "stack", axis: "v", spacing: 3, align: "stretch", distribution: "start",
    leadInset: 21, children: [{ ...leaf, id: "first" }, { ...leaf, id: "last" }] };
  restoreTableCellFlow({ ...source, children: [first, last] }, cell, [8, 8, 9, 8]);
  expect(cell.leadInset).toBe(6);
  expect(cell.padding).toEqual([8, 8, 13, 8]);
});

test("collapsed content insets use half of each resolved border and preserve asymmetry", () => {
  const { source } = spanningText();
  Object.assign(source.styles, { "padding-top": "5px", "padding-right": "7px", "padding-bottom": "11px", "padding-left": "13px",
    "border-top-width": "2px", "border-top-style": "solid", "border-right-width": "4px", "border-right-style": "solid",
    "border-bottom-width": "6px", "border-left-width": "8px", "border-left-style": "solid" });
  expect(tableCellInsets(source, true)).toEqual([6, 9, 14, 17]);
  expect(tableCellInsets(source, false)).toEqual([7, 11, 17, 21]);
});
