import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("pre preserves whitespace and reports monospace font substitution", async () => {
  const html = '<main data-markswift-root><pre id="sample">one    two\n  indented line</pre></main>';
  const result = await convertHtml(html, {
    name: "PreFontBoundary", mode: "app", viewport: { width: 320, height: 180 },
    css: "body{margin:0}main{box-sizing:border-box;width:320px;height:180px;padding:20px;background:white;color:#18202a}pre{margin:0;font:16px/24px ui-monospace,monospace;white-space:pre}",
  });
  const textNodes: Array<{ content: string; lines: number }> = [];
  visit(inferScreen(result.layout, "PreFontBoundary").root, node => {
    if (node.kind === "text") textNodes.push({ content: node.runs.map(run => run.text).join(""), lines: node.lines });
  });
  expect(textNodes).toEqual([{ content: "one    two\n  indented line", lines: 2 }]);
  expect(result.code).toContain(".monospaced");
  expect(result.diagnostics.flatMap(item => item.notes).join("\n")).toContain("font-family ui-monospace");
});
