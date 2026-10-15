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

const LOSSES: [string, Record<string, string>, string[]][] = [
  ["hyphens: auto", { hyphens: "auto" }, ["hyphens"]],
  ["word-break: break-all", { "word-break": "break-all" }, ["word-break"]],
  ["overflow-wrap: anywhere", { "overflow-wrap": "anywhere" }, ["overflow-wrap"]],
  ["text-wrap-style: balance", { "text-wrap-style": "balance" }, ["text-wrap-style"]],
  ["word-spacing: 8px", { "word-spacing": "8px" }, ["word-spacing"]],
  ["text-indent: 2em", { "text-indent": "32px" }, ["text-indent"]],
  ['font-feature-settings: "liga" 0', { "font-feature-settings": '"liga" 0' }, ["font-feature-settings"]],
  ["font-variant-caps: small-caps", { "font-variant-caps": "small-caps" }, ["font-variant-caps"]],
  [
    "underline thickness and offset",
    {
      "-webkit-text-decorations-in-effect": "underline",
      "text-decoration-thickness": "3px",
      "text-underline-offset": "4px",
    },
    ["text-decoration-thickness", "text-underline-offset"],
  ],
];

for (const [name, styles, expected] of LOSSES)
  test(`${name} is reported`, () => {
    const found = features(doc(styles));
    for (const feature of expected) expect(found).toContain(feature);
  });

test("default text property values are not reported", () => {
  const found = features(
    doc({
      "word-spacing": "0px",
      "text-indent": "0px",
      "font-feature-settings": "normal",
      hyphens: "manual",
      "-webkit-text-decorations-in-effect": "underline",
      "text-decoration-thickness": "auto",
    }),
  );
  for (const feature of [
    "word-spacing",
    "text-indent",
    "font-feature-settings",
    "hyphens",
    "text-decoration-thickness",
  ])
    expect(found).not.toContain(feature);
});
