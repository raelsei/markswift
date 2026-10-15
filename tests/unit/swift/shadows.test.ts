import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

function cardDoc(shadows: string, border = "0px", background = "rgb(255, 140, 0)"): LayoutDoc {
  const root: LayoutNode = {
    tag: "div",
    attrs: {},
    bounds: { x: 0, y: 0, w: 180, h: 230 },
    styles: {
      display: "block",
      "background-color": background,
      "border-top-left-radius": "24px",
      "border-top-right-radius": "24px",
      "border-bottom-left-radius": "24px",
      "border-bottom-right-radius": "24px",
      "box-shadow": shadows,
      "border-top-width": border,
      "border-right-width": border,
      "border-bottom-width": border,
      "border-left-width": border,
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "rgb(255, 243, 163)",
      "border-right-color": "rgb(255, 243, 163)",
      "border-bottom-color": "rgb(255, 243, 163)",
      "border-left-color": "rgb(255, 243, 163)",
      "overflow-x": "hidden",
      "overflow-y": "hidden",
    },
    children: [],
  };
  return {
    version: LAYOUT_DOC_VERSION,
    source: "shadow-test",
    combo: { screen: "card", theme: "light" },
    size: { w: 180, h: 230 },
    viewport: { x: 0, y: 0, w: 180, h: 230 },
    conditions: [],
    dpr: 3,
    canvas: "rgb(24,21,43)",
    fonts: [],
    root,
  };
}

function card(shadows: string, border = "0px", background?: string) {
  return emitSwift(inferScreen(cardDoc(shadows, border, background), "card"), "CardView", { mode: "fidelity" }).view;
}

test("multiple CSS box shadows derive independently from the box, without cascading through content", () => {
  const swift = card(
    "rgb(196, 91, 0) 0px 8px 0px 0px, rgba(0, 0, 0, 0.45) 0px 15px 30px 0px",
    "0px",
    "rgba(255, 140, 0, 0.5)",
  );
  expect(swift).not.toContain(".shadow(");
  expect(swift.match(/\.blendMode\(\.destinationOut\)/g)).toHaveLength(2);
  expect(swift).toContain(".blur(radius: 15.0)");
  expect(swift).toContain(".offset(x: 0.0, y: 8.0)");
  expect(swift).toContain(".offset(x: 0.0, y: 15.0)");
  expect(swift.indexOf(".offset(x: 0.0, y: 8.0)")).toBeLessThan(swift.indexOf(".offset(x: 0.0, y: 15.0)"));
});

test("an opaque fill hides the shadow interior, so spread-0 shadows are native casters behind it", () => {
  const swift = card("rgb(196, 91, 0) 0px 8px 0px 0px, rgba(0, 0, 0, 0.45) 0px 15px 30px 0px");
  expect(swift.match(/\.shadow\(color:/g)).toHaveLength(2);
  expect(swift).not.toContain(".compositingGroup()");
  expect(swift).not.toContain("destinationOut");
  expect(swift).toContain("radius: 15.0, x: 0.0, y: 15.0)");
  expect(swift).toContain("radius: 0.0, x: 0.0, y: 8.0)");
  expect(swift.indexOf("y: 8.0)")).toBeLessThan(swift.indexOf("y: 15.0)"));
});

test("an opaque fill in light but translucent in dark keeps the knockout in an adaptive view", () => {
  const s = "rgba(0, 0, 0, 0.5) 0px 4px 6px 0px";
  const { code } = compileLayout(cardDoc(s, "0px", "rgb(255, 255, 255)"), {
    dark: { ...cardDoc(s, "0px", "rgba(255, 255, 255, 0.05)"), combo: { screen: "card", theme: "dark" } },
  });
  expect(code).toContain(".compositingGroup()");
  expect(code).not.toContain(".shadow(");
});

test("inset shadows preserve their blurred directional edge and stay between the fill and content", () => {
  const swift = card("rgba(255, 255, 255, 0.8) 0px 3px 5px 0px inset", "5px");
  expect(swift).toContain(".blur(radius: 2.5)");
  expect(swift).toContain(".offset(x: 0.0, y: 3.0)");
  expect(swift).toContain("RoundedRectangle(cornerRadius: 19.0, style: .circular)");
  expect(swift).toContain(".mask(alignment: .center) {");
  expect(swift.indexOf(".blur(radius: 2.5)")).toBeLessThan(
    swift.indexOf(".background(Color.markswift(1.0, 0.549, 0.0)"),
  );
  expect(swift).not.toContain(".shadow(");
});

test("spread expands the external shadow silhouette but never the transparent box interior", () => {
  const swift = card("rgba(0, 0, 0, 0.5) 2px 4px 6px 3px");
  expect(swift).toContain("RoundedRectangle(cornerRadius: 27.0, style: .circular)");
  expect(swift).toContain(".padding(-3.0)");
  expect(swift).toContain("RoundedRectangle(cornerRadius: 24.0, style: .circular).fill(Color.black)");
  expect(swift).toContain(".blendMode(.destinationOut)");
  expect(swift).not.toContain(".shadow(");
});
