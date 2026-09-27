import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { textLineBoxFixture } from "../../helpers/text-line-box-fixture.ts";

test("both emit modes place admitted text from its measured first baseline", () => {
  const doc = textLineBoxFixture();
  const app = compileLayout(doc, { name: "MeasuredText", mode: "app" });
  const fidelity = compileLayout(doc, { name: "MeasuredText", mode: "fidelity" });
  for (const output of [app, fidelity]) {
    expect(output.code).toContain("MarkswiftTextLineBox(firstBaseline: 15.0, baselineToBottom: 5.0, baselineStep: 20.0");
    expect(output.code).not.toContain(".padding(.vertical,");
  }
  expect(app.code).toContain("greedy: true");
  expect(app.code).toContain("lineGap: 3.293, baselineStep: 20.0");
  expect(app.code).toContain("nativeWeight: UIFont.Weight.regular.rawValue");
  expect(app.code).not.toContain("expectedLines:");
  expect(app.code).not.toContain("fixedHeight:");
  expect(fidelity.code).toContain("fixedHeight: 40.0, expectedLines: 2");
  expect(fidelity.code).not.toContain("height: 40.0, alignment: .leading");
});

test("legacy snapshots preserve their complete view output", () => {
  const doc = textLineBoxFixture();
  delete doc.root.children[0]!.firstBaseline;
  for (const line of doc.root.children[0]!.lines!) delete line.baseline;
  for (const mode of ["app", "fidelity"] as const) {
    const code = compileLayout(doc, { name: "LegacyText", mode }).code;
    expect(code).not.toContain("MarkswiftTextLineBox(");
    expect(code).not.toContain("nativeWeight:");
    expect(mode === "app" ? code.includes(".padding(.vertical, 1.646)") : code.includes("height: 40.0, alignment: .leading")).toBe(true);
  }
});

test("fidelity preserves centered and trailing placement inside a hard-broken line box", () => {
  for (const [css, native] of [["center", "center"], ["right", "trailing"]]) {
    const doc = textLineBoxFixture(); doc.root.styles["text-align"] = css!;
    const code = compileLayout(doc, { name: "AlignedText", mode: "fidelity" }).code;
    expect(code).toContain(`horizontal: .${native}`);
    expect(code).toContain("fixedWidth: 240.0");
    expect(code).toContain(`.multilineTextAlignment(.${native})`);
  }
});

test("measured tokens with internal break opportunities retain ordinary native Text wrapping", () => {
  for (const text of ["Long-layout-boundaries remain visible", "EU/US statuses remain visible", "Code(value) remains visible"]) {
    const doc = textLineBoxFixture(); doc.root.children[0]!.text = text;
    const code = compileLayout(doc, { name: "BreakableTokens", mode: "app" }).code;
    expect(code).toContain("MarkswiftTextLineBox(");
    expect(code).toContain("greedy: false");
    expect(code).not.toContain("MarkswiftGreedyText(");
    expect(code).not.toContain("nativeWeight:");
    expect(code).toContain(".fixedSize(horizontal: false, vertical: true)");
  }
});

test("measured container and single-word labels retain whole CSS words unless character breaking is authored", () => {
  for (const [tag, text] of [["div", "Shrink twice"], ["dt", "Visibility"]]) {
    const doc = textLineBoxFixture();
    doc.root.tag = tag!; doc.root.bounds.h = 30;
    doc.root.children[0]!.text = text!; doc.root.children[0]!.bounds.h = 17; delete doc.root.children[0]!.lines;
    expect(compileLayout(doc, { name: "WholeWords", mode: "app" }).code).toContain("MarkswiftGreedyText(");
    for (const [property, value] of [["word-break", "break-all"], ["overflow-wrap", "anywhere"]]) {
      doc.root.styles[property!] = value!;
      const code = compileLayout(doc, { name: "CharacterBreaks", mode: "app" }).code;
      expect(code).not.toContain("MarkswiftGreedyText(");
      expect(code).toContain(".fixedSize(horizontal: false, vertical: true)");
      delete doc.root.styles[property!];
    }
  }
});
