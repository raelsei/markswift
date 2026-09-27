import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { LayoutDoc } from "../../../src/model/layout.ts";
import { textLineBoxFixture } from "../../helpers/text-line-box-fixture.ts";

test("measured baselines rebase after padding and preserve the CSS line rhythm", () => {
  const screen = inferScreen(LayoutDoc.parse(textLineBoxFixture()), "MeasuredText");
  expect(screen.root.kind).toBe("text");
  if (screen.root.kind !== "text") throw new Error("Expected text");
  expect(screen.root.lineBox).toEqual({ firstBaseline: 15, baselineToBottom: 5, baselineStep: 20, baselines: [15, 35] });
  expect(screen.root.padding).toEqual([5, 0, 5, 0]);
});

test("missing, conflicting or unsupported font geometry stays on the existing text path", () => {
  const mutations = [
    (doc: LayoutDoc) => { delete doc.root.children[0]!.firstBaseline; },
    (doc: LayoutDoc) => { delete doc.root.children[0]!.lines![1]!.baseline; },
    (doc: LayoutDoc) => { doc.root.children[0]!.lines![1]!.baseline = 41; },
    (doc: LayoutDoc) => { doc.root.styles["font-family"] = "Arial,sans-serif"; },
    (doc: LayoutDoc) => { doc.root.styles["font-style"] = "italic"; },
    (doc: LayoutDoc) => { doc.root.styles["line-height"] = "14px"; },
    (doc: LayoutDoc) => { doc.root.styles.direction = "rtl"; },
    (doc: LayoutDoc) => { doc.root.styles["writing-mode"] = "vertical-rl"; },
    (doc: LayoutDoc) => { doc.root.styles["max-height"] = "30px"; },
    (doc: LayoutDoc) => { doc.root.styles["text-overflow"] = "ellipsis"; },
    (doc: LayoutDoc) => { doc.root.styles["white-space"] = "nowrap"; },
  ];
  for (const mutate of mutations) {
    const doc = textLineBoxFixture(); mutate(doc);
    const node = inferScreen(doc, "UnsupportedText").root;
    expect(node.kind).toBe("text");
    if (node.kind === "text") expect(node.lineBox).toBeUndefined();
  }
});

test("uniform colors can share measured line boxes, mixed font weights cannot", () => {
  const doc = textLineBoxFixture();
  const original = doc.root.children[0]!;
  original.text = "First measured line "; original.bounds.h = 17; original.lines = undefined;
  doc.root.children.push({ tag: "span", attrs: {}, styles: { ...doc.root.styles, display: "inline", color: "rgb(100, 10, 20)" },
    bounds: { x: 0, y: 26, w: 140, h: 17 }, children: [{ ...original, text: "second measured line", firstBaseline: 40,
      bounds: { x: 0, y: 26, w: 140, h: 17 }, children: [] }] });
  let node = inferScreen(doc, "UniformRuns").root;
  expect(node.kind === "text" && node.lineBox?.baselines).toEqual([15, 35]);
  const whitespace = { tag: "span", attrs: {}, styles: { ...doc.root.styles, display: "inline", "font-size": "100px" },
    bounds: { x: 100, y: 6, w: 4, h: 17 }, children: [{ tag: "#text", attrs: {}, styles: {}, text: " ",
      bounds: { x: 100, y: 6, w: 4, h: 17 }, children: [] }] };
  doc.root.children.splice(1, 0, whitespace);
  node = inferScreen(doc, "MixedWhitespaceMetrics").root;
  expect(node.kind === "text" && node.lineBox).toBeUndefined();
  doc.root.children.splice(1, 1);
  doc.root.children[1]!.styles["font-weight"] = "700";
  node = inferScreen(doc, "MixedRuns").root;
  expect(node.kind === "text" && node.lineBox).toBeUndefined();
});

test("non-named native weights keep the existing path with an explicit diagnostic only on measured captures", () => {
  const doc = textLineBoxFixture(); doc.root.styles["font-weight"] = "650";
  let node = inferScreen(doc, "VariableWeight").root;
  expect(node.kind === "text" && node.lineBox).toBeUndefined();
  expect(node.notes.join("\n")).toContain("not admitted for font-weight 650");
  delete doc.root.children[0]!.firstBaseline;
  node = inferScreen(doc, "LegacyVariableWeight").root;
  expect(node.notes.join("\n")).not.toContain("measured baseline geometry");
});

test("plain button and link captions preserve their measured absolute baseline inside the control content box", () => {
  for (const tag of ["button", "a"]) {
    const doc = textLineBoxFixture();
    doc.root.tag = tag; doc.root.attrs = tag === "a" ? { href: "https://example.com" } : {};
    doc.root.bounds = { x: 30, y: 100, w: 180, h: 38 };
    doc.root.styles = { ...doc.root.styles, display: "inline-block", "text-align": "center",
      "padding-top": "8px", "padding-bottom": "8px", "padding-left": "12px", "padding-right": "12px",
      "border-top-width": "1px", "border-bottom-width": "1px", "border-left-width": "1px", "border-right-width": "1px",
      "border-top-style": "solid", "border-bottom-style": "solid", "border-left-style": "solid", "border-right-style": "solid" };
    doc.root.children = [{ tag: "#text", attrs: {}, styles: {}, text: "Open output folder", children: [],
      bounds: { x: 43, y: 110, w: 122.52, h: 17 }, firstBaseline: 124 }];
    const node = inferScreen(LayoutDoc.parse(doc), "MeasuredCaption").root;
    if (node.kind !== "control" || node.content[0]?.kind !== "text") throw new Error("Expected a native caption");
    const caption = node.content[0];
    expect(caption.frame).toEqual({ x: 43, y: 109, w: 154, h: 20 });
    expect(caption.lineBox).toEqual({ firstBaseline: 15, baselineToBottom: 5, baselineStep: 20, baselines: [15] });
    expect(caption.frame.y + caption.lineBox!.firstBaseline).toBe(124);
    expect(caption.lineBox!.firstBaseline + caption.lineBox!.baselineToBottom).toBe(caption.frame.h);

    delete doc.root.children[0]!.firstBaseline;
    const legacy = inferScreen(LayoutDoc.parse(doc), "UnmeasuredCaption").root;
    expect(legacy.kind === "control" && legacy.content[0]?.kind === "text" && legacy.content[0].lineBox).toBeUndefined();
  }
});

test("normal line height uses proved single-line browser geometry rather than native font height", () => {
  const doc = textLineBoxFixture();
  doc.root.preferredSize = { width: "auto", height: "auto" };
  doc.root.styles["font-size"] = "16px"; doc.root.styles["line-height"] = "normal";
  doc.root.bounds.h = 28;
  doc.root.children = [{ tag: "#text", attrs: {}, styles: {}, text: "Normal text", children: [],
    bounds: { x: 0, y: 5, w: 90, h: 18 }, firstBaseline: 20 }];
  let node = inferScreen(LayoutDoc.parse(doc), "NormalLine").root;
  expect(node.kind === "text" && node.lineBox).toEqual({ firstBaseline: 15, baselineToBottom: 3, baselineStep: 18, baselines: [15] });
  doc.root.preferredSize.height = "28px";
  node = inferScreen(LayoutDoc.parse(doc), "FixedNormalLine").root;
  expect(node.kind === "text" && node.lineBox).toBeUndefined();
  delete doc.root.preferredSize;
  node = inferScreen(LayoutDoc.parse(doc), "UnprovedNormalLine").root;
  expect(node.kind === "text" && node.lineBox).toBeUndefined();
});
