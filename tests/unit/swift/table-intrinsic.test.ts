import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeNativeTable } from "../../../src/analysis/table-layout.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { tableIntrinsicExpr } from "../../../src/swift/table-intrinsic.ts";
import { fontExpr } from "../../../src/swift/format.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { autoTableFixture } from "../../helpers/table-auto-fixture.ts";
import { nativeIntrinsicWidths } from "../../helpers/table-native-intrinsic.ts";

test("automatic table app descriptors use emitted native fonts while fidelity retains exact frames", () => {
  const doc = autoTableFixture();
  const app = compileLayout(doc, { name: "AutomaticTable", mode: "app" });
  expect(app.code).toContain('text: "Stockholm", font: MarkswiftTableFont.system(size: 16.0, weight: .regular, design: 0), horizontalInset: 18.0');
  expect(app.code).toContain(".font(.system(size: 16.0, weight: .regular, design: .default))");
  const fidelity = compileLayout(doc, { name: "AutomaticTable", mode: "fidelity" });
  expect(fidelity.code).toContain("MarkswiftMeasuredLayout(width: 390.0, height: 94.0, frames:");
  expect(fidelity.code).not.toContain("MarkswiftTableLayout(columns:");
});

test("intrinsic system weight/design selection matches fontExpr including ties", () => {
  const cell = analyzeNativeTable(autoTableFixture().root.children[0]!)!.layout.intrinsic![0]!;
  for (const design of ["default", "rounded", "monospaced", "serif"] as const) {
    for (const weight of [100, 200, 300, 400, 450, 500, 600, 650, 700, 800, 900]) {
      const font = { ...cell.font, family: { kind: "system" as const, design }, weight };
      const normal = fontExpr(font, {} as Parameters<typeof fontExpr>[1]);
      const name = normal.match(/weight: (\.[a-zA-Z]+)/)![1];
      expect(tableIntrinsicExpr({ ...cell, font })).toContain(`weight: ${name}`);
      expect(normal).toContain(`design: .${design}`);
    }
  }
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("actual emitted CoreText descriptors allocate intrinsic columns at 320/390/500 and overflow below minimum", async () => {
  const table = analyzeNativeTable(autoTableFixture().root.children[0]!)!.layout;
  const actual = await nativeIntrinsicWidths(table, [320, 390, 500, 100]);
  expect(actual.maximums.length).toBe(3);
  expect(actual.maximums[0]).toBeGreaterThan(actual.maximums[1]!);
  expect(actual.maximums[1]).toBeGreaterThan(actual.maximums[2]!);
  const minimum = actual.maximums.reduce((a, b) => a + b, 0);
  for (const [index, width] of [320, 390, 500].entries()) {
    expect(actual.widths[index]!.reduce((a, b) => a + b, 0)).toBeCloseTo(width - 34, 6);
    for (let column = 0; column < 3; column++) expect(actual.widths[index]![column]! / actual.maximums[column]!).toBeCloseTo((width - 34) / minimum, 6);
  }
  expect(actual.widths[3]).toEqual(actual.maximums);
}, 60000);

nativeTest("complete emitted automatic table bundles typecheck for iOS in both modes", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    const directory = await mkdtemp(join(tmpdir(), "markswift-auto-table-ios-"));
    try {
      const bundle = compileLayout(autoTableFixture(), { name: "AutomaticTable", mode });
      for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
      const result = await typecheck(directory);
      expect(result.ok, result.output).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}, 120000);
