import { expect, test } from "bun:test";
import { analyzeNativeTable, tableFallbackReason } from "../../../src/analysis/table-layout.ts";
import { allocateTableColumns } from "../../../src/analysis/table-allocation.ts";
import { tableFixture } from "../../helpers/table-fixture.ts";
import { compileLayout } from "../../../src/compiler/index.ts";

const groupEffects: Array<[string, string]> = [
  ["opacity", "0.2"], ["filter", "blur(2px)"], ["backdrop-filter", "blur(2px)"],
  ["mask-image", "linear-gradient(rgb(0,0,0), rgba(0,0,0,0))"], ["mix-blend-mode", "multiply"],
  ["clip-path", "circle(50%)"], ["clip", "rect(0px, 100px, 40px, 0px)"], ["transform", "matrix(1, 0, 0, 1, 10, 0)"],
  ["overflow-x", "hidden"], ["overflow-y", "clip"], ["overflow-x", "auto"], ["overflow-y", "scroll"],
];

test("fixed-table allocation follows declarations across offered widths", () => {
  const columns = [{ kind: "fraction", value: 0.25 }, { kind: "fixed", value: 64 }, { kind: "auto" }] as const;
  expect(allocateTableColumns([...columns], 390)).toEqual([97.5, 64, 228.5]);
  expect(allocateTableColumns([...columns], 320)).toEqual([80, 64, 176]);
  expect(allocateTableColumns([{ kind: "fixed", value: 80, extra: 10 }, { kind: "auto" }], 320)).toEqual([90, 230]);
  expect(allocateTableColumns([{ kind: "fixed", value: 80 }, { kind: "fixed", value: 160 }], 360)).toEqual([120, 240]);
  expect(allocateTableColumns([{ kind: "fraction", value: 0.2 }, { kind: "fixed", value: 80 }, { kind: "fixed", value: 40 }], 390)).toEqual([78, 208, 104]);
  expect(allocateTableColumns([{ kind: "fixed", value: 400 }, { kind: "auto" }], 320)).toBeUndefined();
});

test("native table placement preserves row spans, column spans, sections and caption geometry", () => {
  for (const side of ["top", "bottom"] as const) {
    const doc = tableFixture(390, side), table = doc.root.children[0]!;
    const proof = analyzeNativeTable(table, doc.root)!;
    expect(proof.layout.columns).toEqual([{ kind: "fraction", value: 0.25 }, { kind: "fixed", value: 64 }, { kind: "auto" }]);
    expect(proof.layout.rowMinimums).toEqual([30, 30]);
    expect(proof.layout.insets).toEqual([0, 0, 0, 0]);
    expect(proof.layout.captionSide).toBe(side);
    expect(proof.layout.captionMargins).toEqual([6, 12]);
    expect(proof.members.find(member => member.node.id === "#spanning-header")?.placement).toMatchObject({ kind: "cell", row: 0, column: 0, rowSpan: 2, columnSpan: 1, header: true, section: "tbody" });
    expect(proof.members.find(member => member.node.id === "#column-header")?.placement).toMatchObject({ column: 1, columnSpan: 2 });
    expect(proof.members.find(member => member.node.id === "#fixed-cell")?.placement).toMatchObject({ row: 1, column: 1 });
    expect(proof.members.find(member => member.placement.kind === "body")?.node.bounds).toMatchObject({ y: side === "top" ? 38 : 0, h: 60 });
  }
});

test("rowspan zero extends only to the end of its own section", () => {
  const doc = tableFixture(), table = doc.root.children[0]!;
  table.children[2]!.children[0]!.children[0]!.attrs.rowspan = "0";
  expect(analyzeNativeTable(table, doc.root)?.members.find(member => member.node.id === "#spanning-header")?.placement.rowSpan).toBe(2);
});

test("column and column-group layers retain declared geometry behind spanning cells", () => {
  const doc = tableFixture(), table = doc.root.children[0]!;
  const group = table.children[1]!;
  group.id = "#column-group";
  group.children[0]!.id = "#first-column";
  group.children[0]!.styles["background-color"] = "rgb(200,220,240)";
  const proof = analyzeNativeTable(table, doc.root)!;
  expect(proof.members.find(member => member.node.id === "#column-group")?.placement).toMatchObject({ kind: "section", column: 0, columnSpan: 3, rowSpan: 2 });
  const column = proof.members.find(member => member.node.id === "#first-column")!;
  expect(column.node.bounds).toEqual({ x: 0, y: 38, w: 97.5, h: 60 });
  expect(column.node.styles["background-color"]).toBe("rgb(200,220,240)");
});

test("native table admission rejects measured ratio guessing and unsupported allocation", () => {
  const doc = tableFixture(), table = doc.root.children[0]!;
  table.children[2]!.children[1]!.children[0]!.bounds.w += 5;
  expect(analyzeNativeTable(table, doc.root)).toBeUndefined();
  expect(tableFallbackReason(table)).toContain("do not reproduce");
  table.styles["table-layout"] = "auto";
  expect(analyzeNativeTable(table, doc.root)).toBeUndefined();
  expect(tableFallbackReason(table)).toContain("intrinsic column allocation");
});

test("section and row group effects keep the native table from flattening descendants", () => {
  for (const tag of ["thead", "tbody", "tfoot", "tr"] as const) {
    for (const [property, value] of groupEffects) {
      const doc = tableFixture(), table = doc.root.children[0]!, section = table.children[2]!;
      const group = tag === "tr" ? section.children[0]! : section;
      group.tag = tag;
      group.styles[property] = value;
      expect(analyzeNativeTable(table, doc.root)).toBeUndefined();
      expect(tableFallbackReason(table)).toContain(`<${tag}> ${property}: ${value}`);
      expect(tableFallbackReason(table)).toContain("cannot preserve the group effect");
    }
  }
});

test("default section and row effects still admit native table allocation", () => {
  const doc = tableFixture(), table = doc.root.children[0]!, section = table.children[2]!;
  const defaults = {
    opacity: "1", filter: "none", "backdrop-filter": "none", "mask-image": "none", "mix-blend-mode": "normal",
    "clip-path": "none", clip: "auto", transform: "none", "overflow-x": "visible", "overflow-y": "visible",
  };
  for (const group of [section, ...section.children]) Object.assign(group.styles, defaults);
  expect(analyzeNativeTable(table, doc.root)).toBeDefined();
  expect(tableFallbackReason(table)).toBeUndefined();
});

test("captured fallback keeps section or row opacity on its complete emitted subtree once", () => {
  for (const tag of ["tbody", "tr"] as const) {
    const doc = tableFixture(), table = doc.root.children[0]!, section = table.children[2]!;
    const group = tag === "tr" ? section.children[0]! : section;
    group.styles.opacity = "0.2";
    for (const mode of ["app", "fidelity"] as const) {
      const output = compileLayout(doc, { name: "GroupOpacityTable", mode });
      expect(output.code).not.toContain("MarkswiftTableLayout(columns:");
      expect(output.code.split(".opacity(0.2)").length - 1).toBe(1);
      expect(output.code).toContain("spanning-header");
      expect(output.code).toContain("column-header");
      expect(output.diagnostics.flatMap(item => item.notes).join(" ")).toContain(`<${tag}> opacity: 0.2 requires grouped descendants`);
    }
  }
});
