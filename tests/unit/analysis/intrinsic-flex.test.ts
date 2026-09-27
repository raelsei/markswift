import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { intrinsicFlexFixture } from "../../helpers/intrinsic-flex-fixture.ts";
import { isIntrinsicFlexCaption } from "../../../src/analysis/intrinsic-flex.ts";

function flex(doc = intrinsicFlexFixture()) {
  const screen = inferScreen(doc, "IntrinsicFlex");
  if (screen.root.kind !== "stack") throw new Error("Expected parent");
  const row = screen.root.children[0]!;
  if (row.kind !== "stack") throw new Error("Expected flex");
  return row;
}

test("default-shrink intrinsic words reflow from authored gaps instead of captured rows", () => {
  const doc = intrinsicFlexFixture();
  expect(compileLayout(doc, { name: "IntrinsicWrap", mode: "app" }).code).toContain("MarkswiftIntrinsicFlex(");
  expect(flex(doc).measured).toBeDefined(); // Fidelity still receives the captured frames.
  expect(compileLayout(doc, { name: "IntrinsicWrap", mode: "fidelity" }).code).toContain("MarkswiftMeasuredLayout(");
  expect(compileLayout(doc, { name: "IntrinsicWrap", mode: "app" }).code).not.toContain(".frame(width: 90.0");
});

test("space-between retains multiple intrinsic labels and a decorated live link", () => {
  const code = compileLayout(intrinsicFlexFixture(false, true), { name: "IntrinsicSpread", mode: "app" }).code;
  expect(code).toContain("MarkswiftIntrinsicFlex(");
  expect(code).toContain("between: true");
  expect(code).toContain("Button(action:");
  expect(code).toContain(".underline(");
  expect(code).not.toContain(".frame(width: 75.0");
});

test.each([
  ["flex-grow", "1"], ["flex-shrink", "0.5"], ["min-width", "60px"], ["max-width", "120px"],
  ["margin-left", "5px"], ["order", "1"], ["flex-basis", "100px"], ["letter-spacing", "1px"],
  ["direction", "rtl"], ["word-break", "break-all"], ["overflow-x", "auto"], ["overflow-y", "scroll"],
])("intrinsic flow declines unproved %s:%s without losing captured placement", (property, value) => {
  const doc = intrinsicFlexFixture(); doc.root.children[0]!.children[0]!.styles[property] = value;
  const row = flex(doc);
  expect(row.measured).toBeDefined();
  expect(compileLayout(doc, { name: "Declined", mode: "app" }).code).not.toContain("MarkswiftIntrinsicFlex(");
  expect(row.notes.join(" ")).toContain("captured child positions");
});

test.each(["Long-layout", "EU/US", "Shaped 中", "Quoted \"word\""])("word-flow admission remains unchanged for %s", text => {
  const doc = intrinsicFlexFixture(); doc.root.children[0]!.children[0]!.children[0]!.text = text;
  expect(compileLayout(doc, { name: "Breakable", mode: "app" }).code).not.toContain("MarkswiftIntrinsicFlex(");
});

test("native floor metadata distinguishes CSS auto and authored zero without captured minima", () => {
  const doc = intrinsicFlexFixture();
  doc.root.children[0]!.children[0]!.styles["min-width"] = "0px";
  expect(flex(doc).intrinsicFlex?.automaticMinimum).toEqual([false, true, true]);
  const code = compileLayout(doc, { name: "ZeroMinimum", mode: "app" }).code;
  expect(code).toContain("MarkswiftIntrinsicFlexMinimum.self, value: 16.0");
  expect(code).toContain('MarkswiftTextAdvance.width($0, font: UIFont.systemFont(ofSize: 14.0');
});

test("caption admission retains decoration but rejects shaping and box constraints", () => {
  const row = flex(intrinsicFlexFixture(false, true));
  const link = row.children[1]!;
  if (link.kind !== "control" || link.content[0]?.kind !== "text") throw new Error("Expected caption");
  const caption = link.content[0];
  expect(isIntrinsicFlexCaption(caption)).toBe(true);
  for (const change of [
    { width: { kind: "fixed" as const, px: 70 } }, { maxWidth: 60 }, { padding: [0, 3, 0, 0] as [number, number, number, number] },
    { runs: [{ ...caption.runs[0]!, text: "More than two" }] },
    { runs: [{ ...caption.runs[0]!, italic: true }] }, { runs: [{ ...caption.runs[0]!, kerning: 1 }] },
    { runs: [{ ...caption.runs[0]!, text: "Long-layout" }] }, { runs: [{ ...caption.runs[0]!, text: "Shaped 中" }] },
    { layoutDirection: "rtl" as const }, { align: "center" as const },
  ]) expect(isIntrinsicFlexCaption({ ...caption, ...change })).toBe(false);
});

test.each([
  ["font-kerning", "none"], ["font-feature-settings", '"kern" 0'], ["font-variation-settings", '"wght" 600'],
  ["font-variant-ligatures", "none"], ["font-variant-caps", "small-caps"], ["font-variant-east-asian", "jis04"],
  ["font-variant-position", "super"], ["font-variant-alternates", "historical-forms"],
  ["font-optical-sizing", "none"], ["font-size-adjust", "0.7"], ["font-synthesis", "none"], ["unicode-bidi", "bidi-override"],
  ["font-stretch", "75%"], ["font-stretch", "unknown"], ["font-width", "75%"], ["font-width", "normal"],
])("native intrinsic widths decline captured %s:%s with a specific diagnostic", (property, value) => {
  const doc = intrinsicFlexFixture(); doc.root.children[0]!.children[0]!.styles[property] = value;
  const row = flex(doc);
  expect(row.intrinsicFlex).toBeUndefined(); expect(row.measured).toBeDefined();
  expect(row.notes.join(" ")).toContain(`${property}:${value}`);
});

test("legacy captures missing font settings keep measured placement and explain the missing proof", () => {
  const doc = intrinsicFlexFixture(); delete doc.root.children[0]!.children[0]!.styles["font-kerning"];
  const row = flex(doc);
  expect(row.intrinsicFlex).toBeUndefined(); expect(row.measured).toBeDefined();
  expect(row.notes.join(" ")).toContain("font setting metadata unavailable");
});

test("legacy captures missing the canonical font width keep measured placement", () => {
  const doc = intrinsicFlexFixture(); delete doc.root.children[0]!.children[0]!.styles["font-stretch"];
  const row = flex(doc);
  expect(row.intrinsicFlex).toBeUndefined(); expect(row.measured).toBeDefined();
  expect(row.notes.join(" ")).toContain("font setting metadata unavailable (font-stretch)");
});

test("LTR default block isolation does not change plain whole-word advances", () => {
  const doc = intrinsicFlexFixture();
  doc.root.children[0]!.children[0]!.styles["unicode-bidi"] = "isolate";
  expect(flex(doc).intrinsicFlex).toBeDefined();
});

test("font-declined singleton nowrap text cannot escape into legacy intrinsic native packing", () => {
  const doc = intrinsicFlexFixture(false), source = doc.root.children[0]!;
  source.styles["justify-content"] = "flex-start";
  source.children = source.children.slice(0, 1);
  source.children[0]!.styles["font-kerning"] = "none";
  const row = flex(doc);
  expect(row.intrinsicFlex).toBeUndefined(); expect(row.measured).toBeDefined();
  expect(row.children[0]!.width.kind).toBe("fixed");
  expect(row.notes.join(" ")).toContain("font-kerning:none");
  expect(compileLayout(doc, { name: "SingleFallback", mode: "app" }).code).toContain("MarkswiftMeasuredLayout(");
});
