import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout } from "../../../src/compiler/index.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { TABLE_ALLOCATION_RUNTIME } from "../../../src/swift/table-runtime.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { tableFixture } from "../../helpers/table-fixture.ts";

test("table app emission carries native spans and accessibility; fidelity keeps captured cell frames", () => {
  const app = compileLayout(tableFixture(), { name: "TableView", mode: "app" });
  expect(app.code).toContain("MarkswiftTableLayout(columns:");
  expect(app.code).toContain("rowSpan: 2, columnSpan: 1");
  expect(app.code).toContain("rowSpan: 1, columnSpan: 2");
  expect(app.code).toContain(".accessibilityAddTraits(.isHeader)");
  expect(app.code).toContain("Row 1, column 1, spans 2 rows and 1 columns");
  expect(app.code).toContain(".accessibilityLabel(\"Table, 2 rows, 3 columns\")");
  expect(app.code).toContain(".allowsHitTesting(false)");
  expect(app.code).toContain("alignment: .topLeading");
  const fidelity = compileLayout(tableFixture(), { name: "TableView", mode: "fidelity" });
  expect(fidelity.code).toContain("MarkswiftMeasuredLayout(width: 390.0, height: 98.0, frames:");
  expect(fidelity.code).toContain("CGRect(x: 0.0, y: 38.0, width: 97.5, height: 60.0)");
  expect(fidelity.code).not.toContain("MarkswiftTableLayout(columns:");
});

test("an explicitly sized caption keeps its authored height above the native table body", () => {
  const doc = tableFixture();
  const table = doc.root.children[0]!, caption = table.children[0]!;
  caption.preferredSize = { width: "auto", height: "64px" };
  caption.bounds.h = 64;
  table.bounds.h += 44;
  const shift = (node: typeof table) => { node.bounds.y += 44; node.children.forEach(shift); };
  shift(table.children[2]!);
  const output = compileLayout(doc, { name: "FixedCaption", mode: "app" });
  expect(output.code).toContain("MarkswiftTableLayout(columns:");
  expect(output.code).toContain("height: 64.0");
});

test("native column paint reports table limits without stale captured-width warnings", () => {
  const doc = tableFixture();
  doc.root.children[0]!.children[1]!.children[0]!.id = "#percentage-column";
  const root = inferScreen(doc, "ColumnPaint").root;
  if (root.kind !== "stack") throw new Error("Expected fixture page stack");
  const table = root.children[0]!;
  if (table.kind !== "stack" || !table.table) throw new Error("Expected admitted native table");
  const column = table.children.find(child => child.id === "#percentage-column")!;
  expect(column.width).toEqual({ kind: "fill" });
  expect(column.notes.some(note => note.includes("may not resize proportionally"))).toBe(false);
  expect(column.notes.some(note => note.includes("browser table navigation"))).toBe(true);
});

test("table group effects apply once to cells and caption while body paint carries none", () => {
  const doc = tableFixture();
  Object.assign(doc.root.children[0]!.styles, {
    opacity: "0.5", filter: "blur(2px)", "mix-blend-mode": "multiply", "mask-image": "linear-gradient(rgb(0, 0, 0), rgba(0, 0, 0, 0))",
  });
  const root = inferScreen(doc, "TableEffects").root;
  if (root.kind !== "stack") throw new Error("Expected fixture page stack");
  const table = root.children[0]!;
  if (table.kind !== "stack" || !table.table) throw new Error("Expected admitted native table");
  expect(table.style).toMatchObject({ opacity: 0.5, blur: 2, blend: "multiply", fills: [], shadows: [] });
  expect(table.style.mask).toBeDefined();
  const body = table.children[table.table.placements.findIndex(placement => placement.kind === "body")]!;
  expect(body.style.fills.length).toBe(1);
  for (const effect of ["opacity", "blur", "blend", "mask"] as const) expect(body.style[effect]).toBeUndefined();
  expect(table.children.some(child => child.id === "#caption")).toBe(true);
  expect(table.children.some(child => child.id === "#spanning-header")).toBe(true);
  for (const mode of ["app", "fidelity"] as const) {
    const output = compileLayout(doc, { name: "TableEffects", mode });
    for (const modifier of [".opacity(0.5)", ".blur(radius: 2.0)", ".blendMode(.multiply)", ".mask {"]) {
      expect(output.code.split(modifier).length - 1).toBe(1);
    }
  }
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("the actual Swift allocation runtime executes unequal tracks and span rectangles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-table-allocation-"));
  try {
    await writeFile(join(dir, "proof.swift"), `import Foundation\nimport CoreGraphics\n${TABLE_ALLOCATION_RUNTIME}\n
let tracks: [MarkswiftTableAllocation.Column] = [.init(kind: 1, value: 0.25), .init(kind: 0, value: 64), .init(kind: 2)]
for width: CGFloat in [390, 320] {
    let widths = MarkswiftTableAllocation.columns(tracks, available: width)
    precondition(widths == [width * 0.25, 64, width * 0.75 - 64])
    let cell = MarkswiftTableAllocation.Cell(row: 0, column: 1, rowSpan: 2, columnSpan: 2)
    let rect = MarkswiftTableAllocation.rect(cell, widths: widths, heights: [30, 40], columnGap: 6, rowGap: 4)
    let expectedX: CGFloat = width * 0.25 + 6
    let expectedWidth: CGFloat = width * 0.75 + 6
    precondition(rect == CGRect(x: expectedX, y: 0, width: expectedWidth, height: 74))
}
let grown = MarkswiftTableAllocation.rows(minimums: [30, 30], cells: [.init(row: 0, column: 0), .init(row: 0, column: 1, rowSpan: 2)], heights: [40, 100], gap: 4)
precondition(grown == [53, 43])
let fixed: [MarkswiftTableAllocation.Column] = [.init(kind: 0, value: 80), .init(kind: 0, value: 160), .init(kind: 0, value: 80)]
precondition(MarkswiftTableAllocation.minimum(fixed) == 320)
precondition(MarkswiftTableAllocation.columns(fixed, available: 280) == [80, 160, 80])
print("table allocation and spanning placement passed at 320 and 390")
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", join(dir, "proof.swift"), "-o", join(dir, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [compileError, compiled] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(compiled, compileError).toBe(0);
    const proof = Bun.spawn([join(dir, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, exit] = await Promise.all([new Response(proof.stderr).text(), proof.exited]);
    expect(exit, error).toBe(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);

nativeTest("complete emitted table bundles typecheck for iOS in app and fidelity modes", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    const dir = await mkdtemp(join(tmpdir(), "markswift-table-native-"));
    try {
      const bundle = compileLayout(tableFixture(390, "bottom"), { name: "TableView", mode });
      for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(dir, name), source);
      const check = await typecheck(dir);
      expect(check.ok, check.output).toBe(true);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}, 120000);
