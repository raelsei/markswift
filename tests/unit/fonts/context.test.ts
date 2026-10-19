import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";
import type { TextNode } from "../../../src/model/semantic.ts";
import { bundledFamilies, metricsForFonts } from "../../../src/fonts/metadata.ts";
import type { FontPackage } from "../../../src/fonts/types.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

const styles = {
  display: "block",
  "font-family": "Test Face, sans-serif",
  "font-size": "20px",
  "line-height": "30px",
  color: "rgb(0, 0, 0)",
};
const bounds = { x: 0, y: 0, w: 200, h: 60 };
const doc: LayoutDoc = {
  version: LAYOUT_DOC_VERSION,
  source: "font-context",
  combo: { screen: "test", theme: "light" },
  size: { w: 200, h: 60 },
  viewport: { x: 0, y: 0, w: 200, h: 60 },
  conditions: [],
  dpr: 1,
  canvas: "white",
  fonts: [],
  root: {
    tag: "p",
    attrs: {},
    styles,
    bounds,
    children: [{ tag: "#text", attrs: {}, styles, bounds, text: "Two lines of text", children: [] }],
  },
};

function fontPackage(ascent: number): FontPackage {
  return {
    faces: [
      {
        family: "Test Face",
        file: "test.ttf",
        style: "normal",
        weight: [100, 900],
        axes: { wght: [100, 900] },
        metrics: { upem: 1000, ascent, descent: 200, lineGap: 0, useTypoMetrics: false },
        converted: false,
        renamed: false,
      },
    ],
    assets: {},
    plist: "",
    notes: [],
  };
}

test("interleaved conversions retain their own font selection and leading", async () => {
  const first = fontPackage(800);
  const second = fontPackage(1000);
  const a = inferScreen(doc, "test", { bundledFamilies: bundledFamilies(first) });
  const b = inferScreen(doc, "test", { bundledFamilies: bundledFamilies(second) });
  const fallback = inferScreen(doc, "test");
  expect((a.root as TextNode).runs[0]!.font.family).toEqual({ kind: "custom", name: "Test Face" });
  expect((fallback.root as TextNode).runs[0]!.font.family).toEqual({ kind: "system", design: "default" });
  const metricsA = metricsForFonts(first);
  const metricsB = metricsForFonts(second);
  const [outputA, outputB] = await Promise.all([
    Promise.resolve().then(() => emitSwift(a, "TestView", { mode: "app", fontMetrics: metricsA })),
    Promise.resolve().then(() => emitSwift(b, "TestView", { mode: "app", fontMetrics: metricsB })),
  ]);
  expect(outputA.view).toContain(
    "size: 20.0, style: .title3, lineHeight: 30.0, ascent: 0.8, descent: 0.2, natural: 1.0)",
  );
  expect(outputB.view).toContain(
    "size: 20.0, style: .title3, lineHeight: 30.0, ascent: 1.0, descent: 0.2, natural: 1.2)",
  );
  expect(emitSwift(a, "TestView", { mode: "app", fontMetrics: metricsA }).view).toBe(outputA.view);
  const system = emitSwift(fallback, "TestView", { mode: "app" }).view;
  // SF at 20px: Blink rounds ascent 19.34 → 19 and descent 4.22 → 4; the odd px of the 7px leading goes below.
  expect(system).toContain(
    "size: 20.0, style: .title3, lineHeight: 30.0, ascent: 0.95, descent: 0.25, natural: 1.193)",
  );
  for (const view of [outputA.view, outputB.view, system]) expect(view).not.toContain(".lineSpacing(");
});
