import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const svg = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100" viewBox="0 0 150 100"><path d="M0 0 H150 V100 H0 Z" fill="blue"/></svg>',
);

function layout(fit: "cover" | "contain", width: string): LayoutDoc {
  return {
    version: 1, source: "image-fit.html", combo: { screen: "image-fit", theme: "light", demoState: "normal" },
    size: { w: 200, h: 125 }, dpr: 1, canvas: "white", fonts: [],
    root: {
      id: "root", tag: "main", attrs: {}, styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 125 }, children: [{
        id: "#image", tag: "img", attrs: { src: svg, alt: fit, style: `width:${width};height:125px` },
        styles: { display: "block", width: "200px", height: "125px", "object-fit": fit, "object-position": "50% 50%" },
        preferredSize: { width, height: "125px" }, bounds: { x: 0, y: 0, w: 200, h: 125 }, children: [],
      }],
    },
  };
}

test("flexible SVG cover and contain use the live image box in app mode", () => {
  for (const [fit, scale] of [["cover", "max"], ["contain", "min"]] as const) {
    const result = compileLayout(layout(fit, "100%"), { name: "ResponsiveVector", mode: "app" });
    expect(result.code).toContain("GeometryReader { geometry in");
    expect(result.code).toContain(`.scaleEffect(${scale}(geometry.size.width / 150.0, geometry.size.height / 100.0))`);
    expect(result.code).toContain(".frame(width: geometry.size.width, height: geometry.size.height)");
    expect(result.code).toContain(`.accessibilityLabel("${fit}")`);
    expect(result.files["MarkswiftShapes.swift"]).toContain("MarkswiftShape_");
    expect(result.diagnostics.some(item => item.id === "#image")).toBe(false);
  }
});

test("fixed app and fidelity SVG boxes keep their measured cover artwork", () => {
  for (const [mode, width] of [["app", "200px"], ["fidelity", "100%"]] as const) {
    const code = compileLayout(layout("cover", width), { name: "FixedVector", mode }).code;
    expect(code).not.toContain("GeometryReader { geometry in");
    expect(code).toContain(".frame(width: 200.0, height: 133.333)");
  }
});
