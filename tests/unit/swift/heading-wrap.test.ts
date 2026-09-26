import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";
import type { TextNode } from "../../../src/model/semantic.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { textExpr } from "../../../src/swift/text.ts";

const title = "Typography in motion";

function heading(width: 320 | 390, tag = "h1"): LayoutDoc {
  const contentWidth = width - 46;
  const wraps = width === 320;
  return {
    version: 1, source: "heading.html", combo: { screen: "heading", theme: "light", demoState: "normal" },
    size: { w: width, h: 180 }, dpr: 2, canvas: "white", fonts: [],
    root: { tag: "main", id: "root", attrs: {}, styles: { display: "block", "padding-left": "23px", "padding-right": "23px" }, bounds: { x: 0, y: 0, w: width, h: 180 }, children: [{
      tag, id: "title", attrs: {},
      styles: { display: "block", "font-family": "system-ui", "font-size": "31px", "font-weight": "700", "line-height": "35px", color: "rgb(29, 38, 52)" },
      bounds: { x: 23, y: 20, w: contentWidth, h: wraps ? 70 : 35 },
      children: [{
        tag: "#text", attrs: {}, styles: {},
        bounds: { x: 23, y: 20, w: wraps ? 205.77 : 321, h: wraps ? 72 : 37 }, text: title, children: [],
        lines: wraps
          ? [
            { bounds: { x: 23, y: 20, w: 205.77, h: 37 }, start: 0, length: 13 },
            { bounds: { x: 23, y: 55, w: 101.03, h: 37 }, start: 14, length: 6 },
          ]
          : [{ bounds: { x: 23, y: 20, w: 321, h: 37 }, start: 0, length: title.length }],
      }],
    }] },
  };
}

function titleNode(): TextNode {
  const root = inferScreen(heading(320), "Heading").root;
  if (root.kind !== "stack" || root.children[0]?.kind !== "text") throw new Error("Expected one heading text node");
  return root.children[0];
}

test("plain bold heading uses word flow in app mode at both captured widths", () => {
  for (const width of [320, 390] as const) {
    const screen = inferScreen(heading(width), "Heading");
    const app = emitSwift(screen, "HeadingView", { mode: "app" }).view;
    const fidelity = emitSwift(screen, "HeadingView", { mode: "fidelity" }).view;
    expect(app).toContain('MarkswiftGreedyText("Typography in motion", font: .system(size: 31.0, weight: .bold, design: .default)');
    expect(fidelity).toContain(`Text(verbatim: ${JSON.stringify(width === 320 ? "Typography in\nmotion" : title)})`);
    expect(fidelity).not.toContain("MarkswiftGreedyText");
  }
});

test("every heading level accepts plain system-font words", () => {
  for (let level = 1; level <= 6; level++) {
    const app = emitSwift(inferScreen(heading(320, `h${level}`), "Heading"), "HeadingView", { mode: "app" }).view;
    expect(app).toContain('MarkswiftGreedyText("Typography in motion"');
  }
});

test("interactive, styled, bound and unsupported heading text retains native Text", () => {
  const original = titleNode();
  const cases: TextNode[] = [
    { ...original, runs: [{ ...original.runs[0]!, href: "https://example.com" }] },
    { ...original, runs: [{ ...original.runs[0]!, text: "Typography " }, { ...original.runs[0]!, text: "in motion" }] },
    { ...original, runs: [{ ...original.runs[0]!, bound: true }] },
    { ...original, runs: [{ ...original.runs[0]!, text: "Typographie en été" }] },
    { ...original, runs: [{ ...original.runs[0]!, italic: true }] },
    { ...original, runs: [{ ...original.runs[0]!, font: { ...original.runs[0]!.font, family: { kind: "custom", name: "Example" } } }] },
    { ...original, noWrap: true },
    { ...original, align: "center" },
    { ...original, sourceTag: "script" },
    { ...original, sourceTag: "p", runs: [{ ...original.runs[0]!, font: { ...original.runs[0]!.font, weight: 700 } }] },
  ];
  for (const node of cases) expect(textExpr(node, { mode: "app", fontMetrics: {} }).join("\n")).not.toContain("MarkswiftGreedyText");
});
