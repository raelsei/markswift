import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";

/** Browser-style measured plain labels; exact native measurements are tested separately. */
export function intrinsicFlexFixture(wrapping = true, link = false): LayoutDoc {
  const font = { display: "block", "box-sizing": "border-box", "font-family": "system-ui", "font-size": "14px",
    "font-weight": "400", "line-height": "20px", color: "rgb(0, 0, 0)",
    "font-kerning": "auto", "font-feature-settings": "normal", "font-variation-settings": "normal",
    "font-variant-ligatures": "normal", "font-variant-caps": "normal", "font-variant-east-asian": "normal",
    "font-variant-position": "normal", "font-variant-alternates": "normal", "font-variant-numeric": "normal",
    "font-optical-sizing": "auto", "font-size-adjust": "none", "font-synthesis": "weight style small-caps", "unicode-bidi": "normal" };
  const definitions = wrapping ? [["Alpha Beta", 90, 0, 0], ["Gamma", 75, 98, 0], ["Delta Echo", 95, 0, 38]] as const
    : [["Two labels", 90, 0, 0], ["Open link", 75, 125, 0]] as const;
  const children: LayoutNode[] = definitions.map(([text, width, x, y], index): LayoutNode => ({
    id: `item${index}`, tag: link && index === 1 ? "a" : "span", attrs: link && index === 1 ? { href: "#details" } : {},
    styles: { ...font, "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "min-width": "auto",
      "padding-left": "8px", "padding-right": "8px", "padding-top": "5px", "padding-bottom": "5px",
      ...(link && index === 1 ? { "text-decoration-line": "underline" } : {}) },
    preferredSize: { width: "auto", height: "auto" }, bounds: { x: x + 16, y: y + 16, w: width, h: 30 }, children: [{
      tag: "#text", attrs: {}, styles: {}, text, firstBaseline: y + 36,
      bounds: { x: x + 24, y: y + 22, w: width - 16, h: 17 }, children: [],
    }],
  }));
  const flex: LayoutNode = { id: "flex", tag: "section", attrs: {}, styles: { ...font, display: "flex", "flex-direction": "row",
    "flex-wrap": wrapping ? "wrap" : "nowrap", "column-gap": "8px", "row-gap": "8px", "justify-content": wrapping ? "flex-start" : "space-between", "align-items": "flex-start", "align-content": "normal" },
    preferredSize: { width: "auto", height: "auto", inlineSizeDefinite: true }, bounds: { x: 16, y: 16, w: 200, h: wrapping ? 68 : 30 }, children };
  return { version: 1, source: "intrinsic-flex.html", combo: { screen: "intrinsic-flex", theme: "light", demoState: "normal" },
    size: { w: 232, h: 150 }, dpr: 2, canvas: "white", fonts: [], root: { id: "root", tag: "main", attrs: {}, styles: { ...font, "padding-left": "16px", "padding-right": "16px", "padding-top": "16px" },
      preferredSize: { width: "100%", height: "150px" }, bounds: { x: 0, y: 0, w: 232, h: 150 }, children: [flex] } };
}
