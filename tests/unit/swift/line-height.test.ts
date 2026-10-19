import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { command } from "../../../tools/verify/process.ts";
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

test("tight leading compresses only text the browser broke into lines", () => {
  expect(emit(paragraph({ "line-height": "15px" }, 30), "app").view).toContain("compressLines: true");
  expect(emit(paragraph({ "line-height": "15px" }, 15), "app").view).not.toContain("compressLines");
  expect(emit(paragraph({}, 40), "app").view).not.toContain("compressLines");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

/** `Report` prints the height its child answers at 300 pt of width: around the helper the box, inside it the `Text`. */
const MAIN = `import SwiftUI

struct Report: Layout {
    let label: String
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = subviews[0].sizeThatFits(ProposedViewSize(width: 300, height: nil))
        print("\\(label) \\(Double(size.height))")
        return size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}

func label(_ tag: String, _ size: CGFloat, _ lineHeight: CGFloat, compress: Bool = false) -> some View {
    Report(label: "\\(tag)-box") {
        Report(label: "\\(tag)-text") { Text("Email me about deploys").font(.system(size: size, weight: .medium)) }
            .markswiftLineHeight(lineHeight, size: size, relativeTo: .subheadline, ascent: 1.0, descent: 0.286,
                                 compressLines: compress, exactLineBox: true)
    }
}

if #available(macOS 26.0, *) { print("os26 1") }
for scale in [1, 2, 3] as [CGFloat] {
    let s = "@\\(Int(scale))"
    for view in [label("none14" + s, 14, 14), label("none13" + s, 13, 13), label("loose" + s, 14, 20),
                 label("compressed" + s, 14, 14, compress: true), label("fractional" + s, 14, 19.25)] {
        let renderer = ImageRenderer(content: view)
        renderer.scale = scale
        _ = renderer.nsImage
    }
    for (tag, height) in [("field", 22 + 1 / scale), ("grown-field", 44)] {
        let view = Report(label: tag + s) {
            Color.clear.frame(width: 100, height: height)
                .markswiftFieldLineHeight(24, size: 16, relativeTo: .callout, natural: 1.3, capturedHeight: 22)
        }.environment(\\.displayScale, scale)
        _ = ImageRenderer(content: view).nsImage
    }
}
`;

nativeTest(
  "iOS/macOS 26+: a line-height below the natural line keeps the CSS line box while the Text keeps its glyphs",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-line-height-"));
    try {
      await Bun.write(join(directory, "runtime.swift"), SWIFT_RUNTIME);
      await Bun.write(join(directory, "main.swift"), MAIN);
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"], undefined, 15_000)).trim();
      await command(
        [
          ...["xcrun", "swiftc", "-sdk", sdk, "-target", "arm64-apple-macos15.0", "-swift-version", "6"],
          ...["-default-isolation", "MainActor", "-o", join(directory, "lh")],
          ...[join(directory, "runtime.swift"), join(directory, "main.swift")],
        ],
        directory,
        240_000,
      );
      const out: Record<string, number> = {};
      for (const line of (await command([join(directory, "lh")], directory, 30_000)).trim().split("\n")) {
        const [key, h] = line.split(" ");
        out[key!] ??= Number(h);
      }
      // iOS/macOS 18–25 take the `.lineSpacing` path, which never compressed the Text.
      if (!out["os26"]) return;
      // leading-none: the box is the CSS line box at every pixel scale; the Text inside keeps SF's natural line
      // (2444/2048 of the size, rounded up to the pixel), so its frame holds its glyphs.
      for (const scale of [1, 2, 3]) {
        expect([out[`none14@${scale}-box`], out[`none13@${scale}-box`]]).toEqual([14, 13]);
        expect(out[`none14@${scale}-text`]).toBeGreaterThanOrEqual((14 * 2444) / 2048);
        expect(out[`none13@${scale}-text`]).toBeGreaterThanOrEqual((13 * 2444) / 2048);
        // A loose line height is unchanged: Text and box are the CSS line box; so is a compressed one's.
        expect([out[`loose@${scale}-box`], out[`loose@${scale}-text`]]).toEqual([20, 20]);
        expect(out[`field@${scale}`]).toBe(22);
        expect(out[`grown-field@${scale}`]).toBe(44);
        expect(out[`fractional@${scale}-box`]).toBe(19.25);
        expect(out[`fractional@${scale}-text`]).toBeGreaterThanOrEqual(19.25);
        expect([out[`compressed@${scale}-box`], out[`compressed@${scale}-text`]]).toEqual([14, 14]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);

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

test("anon-flex-line-box — text beside an icon in a flex box keeps its half-leading", () => {
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

test("text-balance — balanced multi-line text balances its native lines in app mode", () => {
  const doc = paragraph({ "text-wrap-style": "balance", "text-align": "center" }, 40);
  expect(emit(doc, "app").view).toMatch(/\.markswiftLineHeight\([^\n]*\)\n\s*\.markswiftBalance\(\)\n/);
  expect(emit(doc, "fidelity").view).not.toContain("markswiftBalance");
  // One line has nothing to balance.
  expect(emit(paragraph({ "text-wrap-style": "balance" }, 20), "app").view).not.toContain("markswiftBalance");
});

test("fractional uniform app text removes pixel rounding from its layout box", () => {
  expect(emit(paragraph({ "line-height": "19.25px" }, 19.25), "app").view).toContain("exactLineBox: true");
  expect(emit(paragraph({ "line-height": "19.25px" }, 19.25), "fidelity").view).not.toContain("exactLineBox");
});

test("clamped text retains the native line-count box", () => {
  const doc = paragraph(
    {
      "line-height": "19.25px",
      display: "-webkit-box",
      "-webkit-line-clamp": "1",
      "-webkit-box-orient": "vertical",
      overflow: "hidden",
    },
    19.25,
  );
  const view = emit(doc, "app").view;
  expect(view).toContain(".lineLimit(1)");
  expect(view).not.toContain("exactLineBox: true");
});
