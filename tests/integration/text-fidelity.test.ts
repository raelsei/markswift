import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

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

browserTest("fidelity preserves browser wraps between styled runs without a leading indent", async () => {
  const result = await convertHtml('<p>A <strong>well chosen</strong> font can change how a page feels. <em>Details matter</em> when the line wraps.</p>', {
    name: "StyledParagraph", mode: "fidelity", root: "p", viewport: { width: 320, height: 200 },
    css: "body{margin:0}p{margin:0;width:274px;font:18px/27px system-ui}",
  });
  expect(result.code).toContain('Text(verbatim: " font can change\\nhow a page feels. ")');
  expect(result.code).toContain('Text(verbatim: "Details matter").font(');
  expect(result.code).toContain('Text(verbatim: "\\nwhen the line wraps.")');
  expect(result.code).not.toContain('Text(verbatim: "\\n when the line wraps.")');
  expect(result.code).toContain(".fixedSize(horizontal: true, vertical: true)");
  const app = compileLayout(result.layout, { mode: "app" });
  expect(app.code).toContain('Text(verbatim: " when the line wraps.")');
  expect(app.code).not.toContain('Text(verbatim: "\\nwhen the line wraps.")');
}, 30000);

browserTest("a wrapped inline URL keeps its link and style at the start of the captured line", async () => {
  const result = await convertHtml('<p>Before <a href="https://example.com">next</a></p>', {
    name: "WrappedInlineLink", mode: "fidelity", root: "p", viewport: { width: 320, height: 120 },
    css: "body{margin:0}p{margin:0;width:70px;font:16px/24px system-ui}a{color:#2563eb;text-decoration:underline}",
  });
  expect(result.code).toContain('Text.markswiftLink("\\nnext", "https://example.com/")');
  expect(result.code).toContain(".underline()");
  expect(result.code).toContain(".fixedSize(horizontal: true, vertical: true)");
  expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).not.toContain("destination dropped");
}, 30000);

browserTest("mixed font sizes and raised text share a native line when browser glyph boxes overlap", async () => {
  for (const [markup, literal] of [
    ['<span style="font-size:48px">BIG</span><span style="font-size:12px">small</span>', "small"],
    ['x<span style="vertical-align:12px">up</span>y', "y"],
  ]) {
    const result = await convertHtml(`<p>${markup}</p>`, {
      name: "SharedBaseline", mode: "fidelity", root: "p", viewport: { width: 600, height: 120 },
      css: "body{margin:0}p{margin:0;width:600px;font:20px system-ui}",
    });
    expect(result.code).toContain(`Text(verbatim: "${literal}")`);
    expect(result.code).not.toContain(`Text(verbatim: "\\n${literal}")`);
  }
}, 30000);

browserTest("styled wraps with tight line-height retain their break and report the native line-height limitation", async () => {
  const result = await convertHtml('<p><b>first</b> <i>second</i></p>', {
    name: "TightStyledLines", mode: "fidelity", root: "p", viewport: { width: 320, height: 120 },
    css: "body{margin:0}p{margin:0;width:80px;font:20px/12px system-ui}",
  });
  expect(result.code).toContain('Text(verbatim: "\\nsecond")');
  expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("lines cannot be compressed");
}, 30000);
