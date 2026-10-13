import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc } from "../../../src/model/layout.ts";
import type { SemNode, TextNode } from "../../../src/model/semantic.ts";

function paragraph(styles: Record<string, string>, h: number, text = "Measured text shifts nearby layout."): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "paragraph.html",
    combo: { screen: "paragraph", theme: "light" },
    size: { w: 320, h: 180 },
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
            "font-size": "15px",
            "font-weight": "400",
            "line-height": "20px",
            color: "rgb(24, 32, 42)",
            ...styles,
          },
          bounds: { x: 20, y: 20, w: 280, h },
          children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 20, y: 20, w: 222, h }, text, children: [] }],
        },
      ],
    },
  };
}

const emit = (doc: LayoutDoc, mode: "app" | "fidelity") => emitSwift(inferScreen(doc, "Paragraph"), "P", { mode });

test("app text with a line-height emits one markswiftLineHeight and no lineSpacing or vertical padding", () => {
  const app = emit(paragraph({}, 20), "app").view;
  expect(app.match(/\.markswiftLineHeight\(/g)).toHaveLength(1);
  // SF at 15px: Blink's rounded ascent 15 and descent 3, 2px leading split evenly.
  expect(app).toMatch(
    /\.fixedSize\(horizontal: false, vertical: true\)\n\s*\.markswiftLineHeight\(20\.0, size: 15\.0, relativeTo: \.subheadline, ascent: 1\.0, descent: 0\.2\)\n/,
  );
  expect(app).not.toContain(".lineSpacing(");
  expect(app).not.toContain(".padding(.vertical");
  expect(app).not.toContain(".exact(");
});

test("fidelity keeps lineSpacing and never uses the helper", () => {
  expect(emit(paragraph({}, 20), "fidelity").view).not.toContain("markswiftLineHeight");
  const multi = emit(paragraph({}, 40), "fidelity").view;
  expect(multi).not.toContain("markswiftLineHeight");
  expect(multi).toContain(".lineSpacing(");
});

test("line-height normal emits no helper", () => {
  expect(emit(paragraph({ "line-height": "normal" }, 18), "app").view).not.toContain("markswiftLineHeight");
});

test("a clipped box leaves out the half-leading", () => {
  const doc = paragraph({ "line-height": "20px", "max-height": "10px", overflow: "hidden" }, 10);
  doc.root.children[0]!.children[0]!.bounds.h = 40;
  expect(emit(doc, "app").view).toContain("halfLeading: false");
});

test("tight multi-line leading is reported as compressing on iOS 26+ only", () => {
  const report = emit(paragraph({ "line-height": "15px" }, 30), "app").report;
  const msg = report.flatMap((r) => r.diagnostics).find((d) => d.feature === "line-height")?.message;
  expect(msg).toContain("iOS 26");
});

test("app floors a padded sub/sup line-box growth instead of padding it", () => {
  const subSup = (mode: "app" | "fidelity") => {
    const screen = inferScreen(paragraph({}, 20, "Water H"), "Paragraph");
    const root = screen.root as SemNode & { children?: SemNode[] };
    const text = (root.kind === "text" ? root : root.children!.find((c) => c.kind === "text")) as TextNode;
    const host = text.runs[0]!;
    const small = { ...host.font, size: 12.5 };
    text.runs = [
      host,
      { ...host, text: "2", font: small, baselineOffset: -4.6 },
      { ...host, text: "O mc", font: host.font },
      { ...host, text: "2", font: small, baselineOffset: 5.4 },
    ];
    text.padding = [text.padding[0], text.padding[1], text.padding[2] + 10, text.padding[3]];
    text.frame = { ...text.frame, h: text.frame.h + 10 };
    text.lineBoxGrowth = { edge: "bottom", px: 10, padded: true };
    return emitSwift(screen, "P", { mode }).view;
  };
  // The 10 px surplus is a top-aligned floor of the measured box, which absorbs the native
  // sub/sup growth (20/15 × (max(15, 12.5 + 5.4) + 4.6 − 15) = 10) and Dynamic Type alike.
  const app = subSup("app");
  expect(app).toContain(".frame(minHeight: 30.0, alignment: .topLeading)");
  expect(app).not.toContain(".padding(.bottom");
  expect(subSup("fidelity")).not.toContain("minHeight");
});

test("small line-box growth (a kbd border) is app-only padding", () => {
  const doc = paragraph({}, 42, "Press Ctrl and abbreviation.");
  const app = emit(doc, "app").view;
  expect(app).toContain(".padding(.bottom, 2.0)");
  expect(emit(doc, "fidelity").view).not.toContain(".padding(.bottom, 2.0)");
});

test("042: anon-flex-line-box — text beside an icon in a flex box keeps its half-leading", () => {
  // An accordion trigger: `flex py-2.5`, 20 px line, a 16 px icon. The #text bounds are the glyph
  // area (18 px); the anonymous flex item around it is the 20 px line box, so the text keeps it.
  const doc = paragraph(
    { display: "flex", "padding-top": "10px", "padding-bottom": "10px" },
    40,
    "How is usage billed?",
  );
  const row = doc.root.children[0]!;
  row.children = [
    {
      tag: "#text",
      attrs: {},
      styles: {},
      bounds: { x: 20, y: 31, w: 134, h: 18 },
      text: "How is usage billed?",
      children: [],
    },
    {
      tag: "div",
      attrs: {},
      styles: { display: "block", "background-color": "rgb(200, 0, 0)", "margin-left": "auto" },
      bounds: { x: 284, y: 30, w: 16, h: 16 },
      children: [],
    },
  ];
  expect(emit(doc, "app").view).not.toContain("halfLeading: false");
});

test("042: text-balance — balanced multi-line text balances its native lines in app mode", () => {
  const doc = paragraph({ "text-wrap-style": "balance", "text-align": "center" }, 40);
  expect(emit(doc, "app").view).toMatch(/\.markswiftLineHeight\([^\n]*\)\n\s*\.markswiftBalance\(\)\n/);
  expect(emit(doc, "fidelity").view).not.toContain("markswiftBalance");
  // One line has nothing to balance.
  expect(emit(paragraph({ "text-wrap-style": "balance" }, 20), "app").view).not.toContain("markswiftBalance");
});
