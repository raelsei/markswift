import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";

function paragraph(): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "paragraph.html",
    combo: { screen: "paragraph", theme: "light" },
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
          id: "paragraph",
          attrs: {},
          styles: {
            display: "block",
            "font-family": "system-ui",
            "font-size": "18px",
            "font-weight": "400",
            "line-height": "27px",
            color: "rgb(24, 32, 42)",
          },
          bounds: { x: 20, y: 20, w: 280, h: 54 },
          children: [
            {
              tag: "#text",
              attrs: {},
              styles: {},
              bounds: { x: 20, y: 20, w: 222, h: 54 },
              text: "Measured text shifts nearby layout.",
              children: [],
            },
          ],
        },
      ],
    },
  };
}

test("plain app paragraphs select the native greedy wrapper; fidelity keeps Text", () => {
  const screen = inferScreen(paragraph(), "Paragraph");
  const app = emitSwift(screen, "ParagraphView", { mode: "app" }).view;
  const fidelity = emitSwift(screen, "ParagraphView", { mode: "fidelity" }).view;
  expect(app).toContain('MarkswiftGreedyText(text: "Measured text shifts nearby layout."');
  expect(fidelity).toContain('Text(verbatim: "Measured text shifts nearby layout.")');
});

/** "Read the " then `<a>`: the browser wrapped exactly at the run boundary, so `a` starts line 2. */
function boundaryWrap(linkY: number, linkSize = "18px"): LayoutDoc {
  const p = paragraph();
  const host = p.root.children[0]!;
  const inline = { ...host.styles, display: "inline", "font-size": linkSize };
  host.children = [
    { tag: "#text", attrs: {}, styles: {}, bounds: { x: 20, y: 20, w: 70, h: 21 }, text: "Read the ", children: [] },
    {
      tag: "a",
      attrs: { href: "https://example.com" },
      styles: inline,
      bounds: { x: 20, y: linkY, w: 120, h: 21 },
      children: [
        {
          tag: "#text",
          attrs: {},
          styles: {},
          bounds: { x: 20, y: linkY, w: 120, h: 21 },
          text: "documentation",
          children: [],
        },
      ],
    },
  ];
  return p;
}

test("a wrap at a run boundary is a fidelity break; app output keeps native wrapping", () => {
  const screen = inferScreen(boundaryWrap(47), "Paragraph");
  const fidelity = emitSwift(screen, "ParagraphView", { mode: "fidelity" }).view;
  const app = emitSwift(screen, "ParagraphView", { mode: "app" }).view;
  expect(fidelity).toContain('"Read the"');
  expect(fidelity).toContain('"\\ndocumentation"');
  expect(app).toContain('"Read the "');
  expect(app).not.toContain("\\n");
});

test("a smaller run on the same baseline is not a break", () => {
  // 14px glyph box sitting on the 18px run's baseline: tops differ by 3px, baselines by < 1px.
  const doc = boundaryWrap(24.2, "14px");
  const link = doc.root.children[0]!.children[1]!;
  link.bounds.h = link.children[0]!.bounds.h = 16.3;
  const fidelity = emitSwift(inferScreen(doc, "Paragraph"), "ParagraphView", { mode: "fidelity" }).view;
  expect(fidelity).not.toContain("\\n");
});
