import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc } from "../../../src/model/layout.ts";
import type { StackNode, TextNode } from "../../../src/model/semantic.ts";

function createDoc(
  text: string,
  styles: Record<string, string> = {},
  lines?: Array<{ bounds: { x: number; y: number; w: number; h: number }; start: number; length: number }>,
): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "test.html",
    combo: { screen: "test", theme: "light" },
    size: { w: 320, h: 180 },
    viewport: { x: 0, y: 0, w: 320, h: 180 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 320, h: 180 },
      children: [
        {
          tag: "p",
          id: "p1",
          attrs: {},
          styles: {
            display: "block",
            "font-family": "system-ui",
            "font-size": "15px",
            "line-height": "20px",
            color: "rgb(24, 32, 42)",
            ...styles,
          },
          bounds: { x: 20, y: 20, w: 280, h: 40 },
          children: [
            {
              tag: "#text",
              attrs: {},
              styles: {},
              bounds: { x: 20, y: 20, w: 280, h: 40 },
              text,
              ...(lines ? { lines } : {}),
              children: [],
            },
          ],
        },
      ],
    },
  };
}

test("soft hyphen in fidelity mode shows a hyphen when broken across lines", () => {
  // "super\u00ADcalifragilistic": length 22, \u00AD at index 5.
  // Second line starts at index 6 ("califragilistic").
  const doc = createDoc("super\u00ADcalifragilistic", {}, [
    { bounds: { x: 20, y: 20, w: 50, h: 20 }, start: 0, length: 6 },
    { bounds: { x: 20, y: 40, w: 80, h: 20 }, start: 6, length: 16 },
  ]);
  const screen = inferScreen(doc, "Test");
  const fidelity = emitSwift(screen, "TestView", { mode: "fidelity" }).view;
  expect(fidelity).toContain('Text(verbatim: "super-\\ncalifragilistic")');
});

test("soft hyphen in fidelity mode does not show a hyphen when unbroken", () => {
  const doc = createDoc("super\u00ADcali", {});
  const screen = inferScreen(doc, "Test");
  const fidelity = emitSwift(screen, "TestView", { mode: "fidelity" }).view;
  expect(fidelity).toContain('Text(verbatim: "super\u00ADcali")');
});

test("zero-width space in fidelity mode drops ZWSP at the break without hyphen", () => {
  // "anti\u200Bdisestablishment": length 23, \u200B at index 4.
  // Second line starts at index 5 ("disestablishment").
  const doc = createDoc("anti\u200Bdisestablishment", {}, [
    { bounds: { x: 20, y: 20, w: 40, h: 20 }, start: 0, length: 5 },
    { bounds: { x: 20, y: 40, w: 100, h: 20 }, start: 5, length: 17 },
  ]);
  const screen = inferScreen(doc, "Test");
  const fidelity = emitSwift(screen, "TestView", { mode: "fidelity" }).view;
  expect(fidelity).toContain('Text(verbatim: "anti\\ndisestablishment")');
});

test("soft hyphen and zero-width space remain breakable in app mode", () => {
  const doc = createDoc("super\u00ADcali", {});
  const screen = inferScreen(doc, "Test");
  const node = (screen.root as StackNode).children[0] as TextNode;
  expect(node.unbreakable).toBeUndefined();
});

test("text-align: justify: the greedy UIKit paragraph justifies, SwiftUI Text reports ragged right", () => {
  const doc = createDoc(
    "Justified text stretches each full line so that both edges line up evenly.",
    { "text-align": "justify" },
    [
      { bounds: { x: 20, y: 20, w: 280, h: 20 }, start: 0, length: 48 },
      { bounds: { x: 20, y: 40, w: 180, h: 20 }, start: 48, length: 26 },
    ],
  );
  const screen = inferScreen(doc, "Test");
  expect(((screen.root as StackNode).children[0] as TextNode).justify).toBe(true);
  // Fidelity draws SwiftUI Text, which has no public justification API: reported, not faked.
  const fidelity = compileLayout(doc, { mode: "fidelity" });
  expect(fidelity.code).not.toContain("justify");
  expect(fidelity.diagnostics.flatMap((r) => r.diagnostics.map((d) => d.feature))).toContain("text-align: justify");
});

test("custom decorations (overline, wavy, double, thickness) emit MarkswiftDecoration and no diagnostics", () => {
  const doc = createDoc("Decorative text", {
    "text-decoration-line": "underline overline",
    "text-decoration-style": "wavy",
    "text-decoration-color": "#db2777",
    "text-decoration-thickness": "3px",
    "text-underline-offset": "4px",
  });
  const screen = inferScreen(doc, "Test");
  const view = emitSwift(screen, "TestView", { mode: "app" }).view;

  expect(view).toContain("MarkswiftDecoration(lines: [");
  expect(view).toContain('kind: "underline", style: "wavy"');
  expect(view).toContain('kind: "overline", style: "wavy"');
  expect(view).toContain("thickness: 3");
  expect(view).toContain("offset: 4");
  expect(view).toContain("MarkswiftTextRenderer()");

  // None of the approximation diagnostics are emitted
  const result = compileLayout(doc);
  const diags = result.diagnostics.flatMap((r) => r.diagnostics.map((d) => d.feature));
  expect(diags).not.toContain("text-decoration-line: overline");
  expect(diags).not.toContain("text-decoration-style");
  expect(diags).not.toContain("text-decoration-thickness");
  expect(diags).not.toContain("text-underline-offset");
});

test("standard underline does not emit MarkswiftDecoration or TextRenderer", () => {
  const doc = createDoc("Simple underlined text", {
    "text-decoration-line": "underline",
    "text-decoration-style": "solid",
  });
  const screen = inferScreen(doc, "Test");
  const view = emitSwift(screen, "TestView", { mode: "app" }).view;

  expect(view).toContain(".underline()");
  expect(view).not.toContain("MarkswiftDecoration");
  expect(view).not.toContain("MarkswiftTextRenderer");
});
