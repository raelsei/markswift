import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { intrinsicWidthExpr } from "../../../src/swift/intrinsic-width.ts";
import { intrinsicMinContentFixture, nestedMinContentFixture } from "../../helpers/intrinsic-min-content-fixture.ts";

test.each([
  [intrinsicMinContentFixture, "MinimumParity0", "914b3cb21168d21757e6c754b8ec391670c097f205d35834f99aa9d836590ec7"],
  [nestedMinContentFixture, "MinimumParity1", "3908338613c7653ccec061c89a1f8aa52ea67691f0478bf04e99f7e5a5d3e1c4"],
] as const)("%s fidelity retains captured widths while its root accepts a finite height proposal", (fixture, name, expected) => {
  const code = compileLayout(fixture(), { name, mode: "fidelity" }).code;
  expect(createHash("sha256").update(code).digest("hex")).toBe(expected);
  expect(code).not.toContain("MarkswiftIntrinsicWidth");
  expect(code).toContain("minHeight: 0.0, maxHeight: .infinity");
});

test("optional descriptor absence retains numeric app and fidelity width constructors", () => {
  const doc = intrinsicMinContentFixture(); doc.root.children[0]!.styles["min-width"] = "72px";
  for (const mode of ["app", "fidelity"] as const) {
    const code = compileLayout(doc, { name: "NumericMinimum", mode }).code;
    expect(code).toContain(".frame(minWidth: 72.0, maxWidth: .infinity");
    expect(code).not.toContain("MarkswiftIntrinsicWidth");
  }
});

test("app contribution uses the shared supplied font and physical inset before box paint", () => {
  const code = compileLayout(nestedMinContentFixture(), { name: "NestedMinimum", mode: "app" }).code;
  expect(code).toContain("MarkswiftIntrinsicWidth.inset(26.0, MarkswiftIntrinsicWidth.maximum([MarkswiftIntrinsicWidth.inset(14.0,");
  expect(code).toContain('MarkswiftIntrinsicWidth.words(["Alpha", "Supercalifragilisticexpialidocious", "Beta"], size: 14.0, weight: UIFont.Weight.regular.rawValue)');
  expect(code.indexOf("minWidth: MarkswiftIntrinsicWidth")).toBeLessThan(code.indexOf(".overlay(Rectangle().strokeBorder(", code.indexOf("minWidth: MarkswiftIntrinsicWidth")));
});

test("a supplied min-content program preserves minimum-over-maximum precedence only in app mode", () => {
  const screen = inferScreen(intrinsicMinContentFixture(), "Precedence");
  if (screen.root.kind !== "stack") throw new Error("Expected root stack");
  const node = screen.root.children[0]!;
  if (!node.intrinsicMinWidth?.program) throw new Error("Expected admitted program");
  node.intrinsicMinWidth.authoredMaxWidth = 40; node.maxWidth = 358;
  const expression = intrinsicWidthExpr(node.intrinsicMinWidth.program) + ".value";
  expect(emitSwift(screen, "Precedence", { mode: "app" }).view).toContain(`maxWidth: max(${expression}, 40.0)`);
  const fidelity = emitSwift(screen, "Precedence", { mode: "fidelity" }).view;
  expect(fidelity).toContain("minWidth: 358.0, maxWidth: 358.0");
  expect(fidelity).not.toContain("MarkswiftIntrinsicWidth");
});

test("an optional descriptor cannot replace a fixed or hugging frame", () => {
  const screen = inferScreen(intrinsicMinContentFixture(), "FixedMinimum");
  if (screen.root.kind !== "stack") throw new Error("Expected root stack");
  const node = screen.root.children[0]!;
  node.width = { kind: "fixed", px: 120 };
  expect(emitSwift(screen, "FixedMinimum", { mode: "app" }).view).not.toContain("MarkswiftIntrinsicWidth");
  node.width = { kind: "hug" };
  expect(emitSwift(screen, "HugMinimum", { mode: "app" }).view).not.toContain("MarkswiftIntrinsicWidth");
});
