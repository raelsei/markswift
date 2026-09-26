import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";

export function equalWrapFixture(width = 354): LayoutDoc {
  const gap = 12, track = (width - gap) / 2;
  const children: LayoutNode[] = Array.from({ length: 4 }, (_, i) => ({
    tag: "article", id: "card-" + i, attrs: {}, bounds: { x: (i % 2) * (track + gap), y: Math.floor(i / 2) * 108, w: track, h: 96 },
    preferredSize: { width: "calc(50% - 6px)", height: "auto" },
    styles: { display: "block", "box-sizing": "border-box", "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "min-height": "96px", "padding-left": "12px", "padding-right": "12px", "padding-top": "12px", "padding-bottom": "12px", "background-color": "rgb(220,230,240)" },
    children: [],
  }));
  return {
    version: 1, source: "equal-wrap", combo: { screen: "cards", theme: "light", demoState: "normal" },
    size: { w: width, h: 204 }, dpr: 1, canvas: "white",
    root: { tag: "section", id: "tracks", attrs: {}, children, bounds: { x: 0, y: 0, w: width, h: 204 },
      preferredSize: { width: "100%", height: "auto" },
      styles: { display: "flex", "flex-direction": "row", "flex-wrap": "wrap", "column-gap": "12px", "row-gap": "12px", "align-items": "stretch", "align-content": "normal" } },
  };
}
