import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import type { EmitMode } from "../../../src/swift/emit.ts";

const TEXT = "Measured text shifts nearby layout.";

function doc(styles: Record<string, string> = {}, lines?: LayoutNode["lines"]): LayoutDoc {
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
            "font-size": "18px",
            "font-weight": "400",
            "line-height": "27px",
            color: "rgb(24, 32, 42)",
            ...styles,
          },
          bounds: { x: 20, y: 20, w: 280, h: 54 },
          children: [
            {
              tag: "#text",
              attrs: {},
              styles: {},
              bounds: { x: 20, y: 20, w: 222, h: 54 },
              text: TEXT,
              ...(lines ? { lines } : {}),
              children: [],
            },
          ],
        },
      ],
    },
  };
}

const features = (layout: LayoutDoc, mode: EmitMode = "app") =>
  compileLayout(layout, { mode }).diagnostics.flatMap((r) => r.diagnostics.map((d) => d.feature));
const twoLines = doc({}, [
  { bounds: { x: 20, y: 20, w: 180, h: 27 }, start: 0, length: 21 },
  { bounds: { x: 20, y: 47, w: 140, h: 27 }, start: 21, length: 14 },
]);

test("app mode does not report the browser's line division: it never bakes it in", () => {
  expect(features(twoLines, "app")).not.toContain("text-wrap-mode");
});

test("fidelity reports the browser's line division it bakes into the literal", () => {
  const fidelity = compileLayout(twoLines, { mode: "fidelity" }).diagnostics.flatMap((r) => r.diagnostics);
  expect(fidelity).toContainEqual(expect.objectContaining({ level: "approximated", feature: "text-wrap-mode" }));
});
