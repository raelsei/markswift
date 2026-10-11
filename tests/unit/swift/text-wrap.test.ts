import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";

function paragraph(): LayoutDoc {
  return {
    version: 2,
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

test("app paragraph uses native Text in both modes", () => {
  const screen = inferScreen(paragraph(), "Paragraph");
  const app = emitSwift(screen, "ParagraphView", { mode: "app" }).view;
  const fidelity = emitSwift(screen, "ParagraphView", { mode: "fidelity" }).view;
  expect(app).toContain('Text(verbatim: "Measured text shifts nearby layout.")');
  expect(fidelity).toContain('Text(verbatim: "Measured text shifts nearby layout.")');
});
