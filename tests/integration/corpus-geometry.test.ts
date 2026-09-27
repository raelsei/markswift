import { expect, test } from "bun:test";
import { CorpusCapture } from "../../tools/verify/corpus-capture.ts";
import type { CorpusFixture } from "../../tools/verify/corpus-model.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("corpus reference geometry uses independently painted DOM borders rather than transform-disabled layout boxes", async () => {
  const fixture: CorpusFixture = { id: "geometry-contract", name: "Geometry contract", category: "geometry",
    structureKey: "geometry/painted-dom", features: ["transform"], split: "development", rootSelector: "#corpus",
    height: 300, responsive: true, hosted: false, background: { light: [255, 255, 255], dark: [255, 255, 255] }, regions: [],
    html: '<main id="corpus"><div id="contents"><div id="painted"></div></div><div id="hidden"></div></main>',
    css: 'body{margin:0}#corpus{width:100%;height:300px;background:white}#contents{display:contents}#painted{width:40px;height:20px;transform:translate(13px,17px) rotate(27deg)}#hidden{display:none}',
  };
  const browser = new CorpusCapture();
  try {
    const result = await browser.capture(fixture, 390, "light");
    expect(result.geometry.width).toBe(390); expect(result.geometry.height).toBe(300);
    const painted = result.geometry.elements.find(node => node.sourceId === "#painted")!;
    expect(painted.frame!.w).toBeGreaterThan(40); expect(painted.frame!.h).toBeGreaterThan(20);
    expect(result.geometry.elements.find(node => node.sourceId === "#contents")!.rendered).toBe(false);
    expect(result.geometry.elements.find(node => node.sourceId === "#hidden")!.frame).toBeUndefined();
    const raw = result.layout.root.children.flatMap(node => node.children.length ? node.children : [node]).find(node => node.id === "#painted")!;
    expect(raw.bounds.w).toBe(40); expect(raw.bounds.h).toBe(20);
    expect(painted.frame!.w).not.toBe(raw.bounds.w);
  } finally { await browser.stop(); }
}, 30_000);
