import { expect, test } from "bun:test";
import { markLineBreaks } from "../../../src/analysis/text-layout.ts";
import type { MeasuredTextRun } from "../../../src/analysis/context.ts";
import type { LayoutNode, Rect } from "../../../src/model/layout.ts";

const rect = (x: number, y: number, w = 80, h = 21): Rect => ({ x, y, w, h });
function run(text: string, bounds: Rect, tag = "#text", whiteSpace = "normal"): MeasuredTextRun {
  const node: LayoutNode = { tag, attrs: {}, styles: {}, bounds, text, children: [] };
  return {
    run: { text, font: { family: { kind: "system", design: "default" }, size: 18, weight: 400 }, color: { r: 0, g: 0, b: 0, a: 1 } },
    node, styleOf: { ...node, styles: { "white-space": whiteSpace } }, src: Array.from(text, (_, i) => i),
  };
}

test("a browser wrap at a styled-run boundary is captured with its consumed leading space", () => {
  const built = [run("A ", rect(0, 0, 16)), run("well chosen", rect(16, 0, 100)), run(" font can change how a page feels. ", rect(0, 0, 250, 48)), run("Details matter", rect(144, 27, 112)), run(" when the line wraps.", rect(0, 54, 164))];
  built[2]!.node.lines = [
    { bounds: rect(116, 0, 134), start: 0, length: 16 },
    { bounds: rect(0, 27, 144), start: 17, length: 18 },
  ];
  markLineBreaks(built);
  expect(built[2]!.run.breaks).toEqual([17]);
  expect(built[4]!.run.breaks).toEqual([1]);
  expect(built[4]!.run.text).toBe(" when the line wraps.");
});

test("a boundary before a linked run is preserved without needing a leading space", () => {
  const before = run("Before ", rect(0, 0));
  const linked = run("next", rect(0, 27));
  linked.run.href = "https://example.com/";
  markLineBreaks([before, linked]);
  expect(linked.run.breaks).toEqual([0]);
  expect(linked.run.href).toBe("https://example.com/");
});

test("explicit br and preserved newlines do not gain a duplicate captured break", () => {
  for (const boundary of [run("\n", rect(80, 0, 0), "br"), run("\n  ", rect(80, 0, 0), "#text", "pre-wrap")]) {
    const following = run("Next", rect(0, 27));
    markLineBreaks([run("Before", rect(0, 0)), boundary, following]);
    expect(following.run.breaks).toBeUndefined();
  }
  const following = run("\nNext", rect(0, 27), "#text", "pre-wrap");
  markLineBreaks([run("Before", rect(0, 0)), following]);
  expect(following.run.breaks).toBeUndefined();
});

test("wbr can become a measured break while same-line RTL and shifted runs do not", () => {
  const afterOpportunity = run("Next", rect(0, 27));
  markLineBreaks([run("Before", rect(0, 0)), run("\u200b", rect(80, 0, 0), "wbr"), afterOpportunity]);
  expect(afterOpportunity.run.breaks).toEqual([0]);
  const rtl = [run("אבג", rect(100, 0)), run("דהו", rect(20, 0))];
  markLineBreaks(rtl);
  expect(rtl[1]!.run.breaks).toBeUndefined();
  const sub = run("2", rect(80, 8, 10, 12));
  markLineBreaks([run("H", rect(0, 0)), sub, run("O", rect(90, 0))]);
  expect(sub.run.breaks).toBeUndefined();
});

test("preformatted indentation survives a boundary between separate text nodes", () => {
  const following = run("  Next", rect(0, 27), "#text", "pre-wrap");
  markLineBreaks([run("Before", rect(0, 0), "#text", "pre-wrap"), following]);
  expect(following.run.breaks).toEqual([0]);
});

test("glyph boxes sharing a baseline do not wrap when their fonts or vertical shifts differ", () => {
  const small = run("small", rect(100, 34, 30, 15));
  markLineBreaks([run("BIG", rect(0, 0, 100, 56)), small]);
  expect(small.run.breaks).toBeUndefined();
  const trailing = run("y", rect(40, 12, 10, 23));
  const raised = run("up", rect(10, 0, 30, 23));
  raised.run.baselineOffset = 12;
  markLineBreaks([run("x", rect(0, 12, 10, 23)), raised, trailing]);
  expect(trailing.run.breaks).toBeUndefined();
});

test("overlapping glyph boxes on separate tight lines retain the measured break", () => {
  const following = run("second", rect(0, 12, 65, 23));
  markLineBreaks([run("first", rect(0, 0, 38, 23)), following]);
  expect(following.run.breaks).toEqual([0]);
});
