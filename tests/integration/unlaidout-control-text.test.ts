import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;
const css = "html,body{margin:0}main{width:100px;min-height:24px;font:16px system-ui}";

browserTest("a zero-layout form feed stays in the source ledger and warns without inventing Text", async () => {
  const [control, blank] = await Promise.all([
    convertHtml('<main data-markswift-root>&#12;</main>', { name: "ControlView", css }),
    convertHtml('<main data-markswift-root></main>', { name: "ControlView", css }),
  ]);
  expect(control.layout.root.textSourceCapture?.occurrences).toEqual([
    expect.objectContaining({ key: "dom:/0", raw: "\f", join: "verified", layoutPresent: false }),
  ]);
  expect(control.warnings).toEqual([
    "Source text dom:/0 contains U+000C without a measured text layout; its raw source is retained, native control-glyph rendering remains unproved",
  ]);
  expect(blank.warnings).toEqual([]);
  expect(control.code).toBe(blank.code);
  expect(control.code).not.toContain("Text(");
}, 30000);

browserTest("hidden control source stays retained without a visible-layout warning", async () => {
  const result = await convertHtml('<main data-markswift-root><span hidden>&#12;</span></main>', { name: "HiddenControlView", css });
  expect(result.layout.root.textSourceCapture?.occurrences).toEqual([
    expect.objectContaining({ key: "dom:/0/0", raw: "\f", join: "verified", layoutPresent: false }),
  ]);
  expect(result.warnings).toEqual([]);
}, 30000);
