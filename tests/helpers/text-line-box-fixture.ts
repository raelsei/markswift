import type { LayoutDoc } from "../../src/model/layout.ts";

/** Two real browser-style glyph boxes inside padded 20px CSS line boxes. */
export function textLineBoxFixture(): LayoutDoc {
  const styles = { display: "block", "font-family": "system-ui", "font-size": "14px", "font-weight": "400",
    "line-height": "20px", color: "rgb(20, 30, 40)", "padding-top": "5px", "padding-bottom": "5px" };
  return { version: 1, source: "text.html", combo: { screen: "text", theme: "light", demoState: "normal" },
    size: { w: 240, h: 50 }, dpr: 2, canvas: "white", fonts: [], root: {
      tag: "p", id: "sample", attrs: {}, styles, bounds: { x: 0, y: 0, w: 240, h: 50 }, children: [{
        tag: "#text", attrs: {}, styles: {}, text: "First measured line second measured line", firstBaseline: 20,
        bounds: { x: 0, y: 6, w: 200, h: 37 }, children: [], lines: [
          { bounds: { x: 0, y: 6, w: 120, h: 17 }, start: 0, length: 20, baseline: 20 },
          { bounds: { x: 0, y: 26, w: 140, h: 17 }, start: 20, length: 19, baseline: 40 },
        ],
      }],
    } };
}
