import type { LayoutDoc } from "../../src/model/layout.ts";

export function gradientFixture(background: string, styles: Record<string, string> = {}): LayoutDoc {
  const text = styles["background-clip"] === "text";
  return { version: 1, source: "gradient-test", combo: { screen: "gradient", theme: "light", demoState: "normal" },
    size: { w: 240, h: 160 }, dpr: 2, canvas: "white", fonts: [], root: {
      id: "#page", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 240, h: 160 }, children: [{
        id: "#gradient", tag: "div", attrs: {}, preferredSize: { width: "100%", height: "80px" },
        styles: { display: "block", "background-image": background, height: "80px", "font-size": "16px", ...styles },
        bounds: { x: 0, y: 0, w: 240, h: 80 }, children: text ? [{
          tag: "#text", attrs: {}, styles: {}, text: "Gradient glyphs", bounds: { x: 0, y: 0, w: 120, h: 20 }, children: [],
        }] : [],
      }],
    } };
}
