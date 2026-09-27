import { expect, test } from "bun:test";
import { CorpusCapture } from "../../tools/verify/corpus-capture.ts";
import type { CorpusFixture } from "../../tools/verify/corpus-model.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

browserTest("corpus capture records original visibility once and independently observes settled borders", async () => {
  const fixture: CorpusFixture = { id: "visibility-origin", name: "Visibility origin", category: "layout", structureKey: "visibility-origin",
    features: ["content-visibility"], split: "development", rootSelector: "#corpus", height: 100, responsive: false, hosted: false,
    background: { light: [255, 255, 255], dark: [255, 255, 255] }, regions: [],
    html: '<main id="corpus"><section id="subject"><label>Retained source</label></section></main>',
    css: 'html,body{margin:0}#corpus{width:100%;height:100px}#subject{content-visibility:auto;box-sizing:border-box;padding:10px;border:1px solid black;height:50px}' };
  const capture = new CorpusCapture();
  try {
    const result = await capture.capture(fixture, 390, "light");
    const subject = result.layout.root.children[0]!;
    expect(subject.sourceContentVisibility).toBe("auto");
    expect(subject.styles["content-visibility"]).toBe("visible");
    expect(result.warnings.some(warning => warning.includes("content-visibility:auto"))).toBe(true);
    const border = result.geometry.elements.find(element => element.sourceId === "#subject");
    expect(border?.frame).toEqual(subject.bounds);
    expect(border?.rendered).toBe(true);
  } finally { await capture.stop(); }
}, 30000);
