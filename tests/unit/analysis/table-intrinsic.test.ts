import { expect, test } from "bun:test";
import { analyzeNativeTable, tableFallbackReason } from "../../../src/analysis/table-layout.ts";
import { allocateIntrinsicTableColumns } from "../../../src/analysis/table-intrinsic.ts";
import { autoTableFixture } from "../../helpers/table-auto-fixture.ts";
import { compileLayout } from "../../../src/compiler/index.ts";

test("automatic tables retain text/font intent and prove unequal intrinsic allocation", () => {
  for (const width of [320, 390, 500]) {
    const doc = autoTableFixture(width), table = doc.root.children[0]!;
    const proof = analyzeNativeTable(table, doc.root)!;
    expect(proof, tableFallbackReason(table)).toBeDefined();
    expect(proof.layout.mode).toBe("auto");
    expect(proof.layout.columns).toEqual([{ kind: "auto" }, { kind: "auto" }, { kind: "auto" }]);
    expect(proof.layout.intrinsic?.[3]).toMatchObject({ column: 0, text: "Stockholm", horizontalInset: 18, font: { family: { kind: "system", design: "default" }, size: 16, weight: 400 } });
    expect(JSON.stringify(proof.layout)).not.toContain("77.02");
  }
  expect(allocateIntrinsicTableColumns([40, 80, 20], 280)).toEqual([80, 160, 40]);
  expect(allocateIntrinsicTableColumns([40, 80, 20], 100)).toEqual([40, 80, 20]);
  expect(allocateIntrinsicTableColumns([0, 0], 100)).toEqual([50, 50]);
});

test("plain token automatic admission rejects unsupported content instead of guessing ratios", () => {
  const cases: Array<[string, (table: ReturnType<typeof autoTableFixture>["root"]) => void]> = [
    ["unbreakable", table => { table.children[0]!.children[0]!.children[0]!.children[0]!.text = "Not ready"; }],
    ["unbreakable", table => { table.children[0]!.children[0]!.children[0]!.children[0]!.text = "North-South"; }],
    ["unbreakable", table => { table.children[0]!.children[0]!.children[0]!.children[0]!.text = "EU/US"; }],
    ["plain text", table => { table.children[0]!.children[0]!.children[0]!.children[0]!.tag = "span"; }],
    ["resolved pixel", table => { table.children[0]!.children[0]!.children[0]!.preferredSize!.hasRelativePadding = true; }],
    ["resolved pixel", table => { table.children[0]!.children[0]!.children[0]!.preferredSize!.width = "20%"; }],
    ["resolved pixel", table => { delete table.children[0]!.children[0]!.children[0]!.preferredSize; }],
    ["shaping", table => { table.children[0]!.children[0]!.children[0]!.styles["letter-spacing"] = "1px"; }],
    ["shaping", table => { table.children[0]!.children[0]!.children[0]!.styles["font-style"] = "italic"; }],
    ["fonts", table => { table.children[0]!.children[0]!.children[0]!.styles["font-family"] = "Unresolved, sans-serif"; }],
    ["group effect", table => { table.children[0]!.styles.opacity = "0.2"; }],
    ["do not reproduce", table => { table.children[0]!.children[0]!.children[0]!.bounds.w += 3; }],
  ];
  for (const [reason, change] of cases) {
    const doc = autoTableFixture(), table = doc.root.children[0]!;
    change(table);
    expect(analyzeNativeTable(table, doc.root)).toBeUndefined();
    expect(tableFallbackReason(table)).toContain(reason);
  }
});

test("automatic spanning cells, captions and column constraints retain captured allocation", () => {
  for (const kind of ["colspan", "rowspan", "caption", "column"] as const) {
    const doc = autoTableFixture(), table = doc.root.children[0]!, body = table.children[0]!;
    if (kind === "colspan") {
      body.children[0]!.children[0]!.attrs.colspan = "2";
      body.children[0]!.children.splice(1, 1);
    } else if (kind === "rowspan") {
      body.children[0]!.children[0]!.attrs.rowspan = "2";
      body.children[1]!.children.shift();
    } else table.children.unshift({ tag: kind === "caption" ? "caption" : "col", attrs: {},
      preferredSize: { width: kind === "caption" ? "auto" : "64px", height: "auto" },
      styles: { display: kind === "caption" ? "table-caption" : "table-column" },
      bounds: { x: 0, y: 0, w: 390, h: 0 }, children: [] });
    expect(analyzeNativeTable(table, doc.root)).toBeUndefined();
    expect(tableFallbackReason(table)).toContain("intrinsic column allocation");
  }
});

test("explicit nowrap preserves an entire ASCII status string as min=max content", () => {
  const doc = autoTableFixture(), table = doc.root.children[0]!, cell = table.children[0]!.children[0]!.children[0]!;
  cell.styles["white-space"] = "nowrap";
  cell.children[0]!.text = "Not ready";
  // This cell remains shorter than Stockholm, so the column maximum is unchanged.
  expect(analyzeNativeTable(table, doc.root)?.layout.intrinsic?.[0]?.text).toBe("Not ready");
  const code = compileLayout(doc, { name: "NonwrappingTable", mode: "app" }).code;
  expect(code).toContain(".fixedSize(horizontal: true, vertical: true)");
  expect(code).toContain('text: "Not ready"');
});

test("bundled custom font substitution cannot silently mismatch an automatic descriptor", () => {
  const doc = autoTableFixture(), table = doc.root.children[0]!;
  expect(analyzeNativeTable(table, doc.root, { "system-ui": { weight: [400, 400] } })).toBeUndefined();
  expect(tableFallbackReason(table)).toContain("matching native intrinsic descriptor");
});
