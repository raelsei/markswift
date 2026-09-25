import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

function findById(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.attrs.id === id) return node;
  for (const child of node.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

browserTest("a complete HTML document retains representative visible element families or reports their limits", async () => {
  const html = `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><title>DocumentTitleOnly</title>
    <style>
      body { margin: 0; width: 390px; font: 16px Arial, sans-serif; color: #17212b; }
      header, nav, article, section, aside, footer, main, profile-card { display: block; padding: 4px; }
      table { border-collapse: collapse; } td, th { border: 1px solid #333; padding: 2px; }
      canvas, video { display: block; width: 40px; height: 25px; }
      svg, img { width: 24px; height: 24px; }
    </style>
  </head><body>
    <header id="header">HeaderSignal</header>
    <nav id="nav">NavSignal</nav>
    <main id="main">
      <article id="article"><section id="section">SectionSignal</section></article>
      <aside id="aside">AsideSignal</aside>
      <p id="phrasing">PhrasingSignal <strong>StrongSignal</strong> <em>EmSignal</em>
        <code>CodeSignal</code> <mark>MarkSignal</mark> <a href="/next">LinkSignal</a></p>
      <ul id="unordered"><li>UnorderedSignal</li></ul>
      <ol id="ordered"><li>OrderedSignal</li></ol>
      <dl id="definitions"><dt>TermSignal</dt><dd>DefinitionSignal</dd></dl>
      <table id="table"><tbody><tr><th>HeadingSignal</th><td>CellSignal</td></tr></tbody></table>
      <ruby id="ruby">BaseSignal<rt>RubySignal</rt></ruby>
      <fieldset id="controls"><legend>LegendSignal</legend>
        <label>LabelSignal<input id="input" value="InputSignal"></label>
        <textarea id="textarea">TextareaSignal</textarea>
        <select id="select"><option selected>OptionSignal</option></select>
        <button id="button">ButtonSignal</button>
        <output id="output">OutputSignal</output>
      </fieldset>
      <details id="details" open><summary>SummarySignal</summary>DetailsSignal</details>
      <img id="image" alt="ImageSignal" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='24' height='24' fill='red'/%3E%3C/svg%3E">
      <svg id="svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="red"/></svg>
      <canvas id="canvas">CanvasFallbackSignal</canvas>
      <video id="video" controls>VideoFallbackSignal</video>
      <profile-card id="custom">CustomSignal</profile-card>
    </main><footer id="footer">FooterSignal</footer>
  </body></html>`;

  const result = await convertHtml(html, { name: "ElementFamilies", viewport: { width: 390, height: 1600 } });
  expect(result.layout.root.tag).toBe("body");
  expect(result.code).not.toContain("DocumentTitleOnly");

  // These are real visible payloads, not registry entries. Their words must survive emission.
  for (const signal of [
    "HeaderSignal", "NavSignal", "SectionSignal", "AsideSignal", "PhrasingSignal", "StrongSignal",
    "EmSignal", "CodeSignal", "MarkSignal", "LinkSignal", "UnorderedSignal", "OrderedSignal",
    "TermSignal", "DefinitionSignal", "HeadingSignal", "CellSignal", "BaseSignal", "RubySignal",
    "LegendSignal", "LabelSignal", "InputSignal", "TextareaSignal", "OptionSignal", "ButtonSignal",
    "OutputSignal", "SummarySignal", "DetailsSignal", "CustomSignal", "FooterSignal",
  ]) expect(result.code).toContain(signal);

  for (const id of [
    "header", "nav", "main", "article", "section", "aside", "phrasing", "unordered", "ordered",
    "definitions", "table", "ruby", "controls", "input", "textarea", "select", "button", "output",
    "details", "image", "svg", "canvas", "video", "custom", "footer",
  ]) expect(findById(result.layout.root, id)).toBeDefined();

  // Where native SwiftUI cannot reproduce the element, the output must say so by source identity.
  for (const id of ["table", "ruby", "custom"]) {
    expect(result.diagnostics.find(item => item.id === `#${id}`)?.confidence).toBe("approximated");
  }
  for (const id of ["canvas", "video"]) {
    expect(result.diagnostics.find(item => item.id === `#${id}`)?.confidence).toBe("unmapped");
  }
}, 60000);

browserTest("image-map hit regions are reported on the image even though area has no layout box", async () => {
  const result = await convertHtml(`<!doctype html><html><body>
    <img id="image-map" width="24" height="24" usemap="#zones"
      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3C/svg%3E">
    <map name="zones"><area shape="rect" coords="0,0,24,24" href="/target" alt="Target"></map>
  </body></html>`, { name: "ImageMap" });
  expect(findById(result.layout.root, "image-map")).toBeDefined();
  expect(result.diagnostics.find(item => item.id === "#image-map")).toEqual(expect.objectContaining({
    confidence: "approximated",
    notes: expect.arrayContaining([expect.stringContaining("hit regions")]),
  }));
}, 30000);
