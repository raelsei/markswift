import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("a word-break opportunity survives inline capture and reports its native approximation", async () => {
  for (const content of ["abcd<wbr>efgh", "<span>abcd<wbr>efgh</span>"]) {
    const result = await convertHtml(`<p data-markswift-root style="width:54px;font:16px system-ui">${content}</p>`, {
      name: "BreakOpportunity",
    });
    expect(JSON.stringify(result.layout.root)).toContain('"tag":"wbr"');
    expect(result.code).toContain("\u200b");
    expect(result.code).not.toContain('Text(verbatim: " efgh")');
    expect(result.diagnostics.some(item => item.notes.some(note => note.includes("<wbr>")))).toBe(true);
  }
}, 30_000);
