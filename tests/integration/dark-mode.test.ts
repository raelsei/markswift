import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { ConversionResult } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

const HTML = '<main data-markswift-root><h2>Account</h2><p class="note">Signed in</p><span class="badge">Pro</span><span class="badge">Beta</span></main>';
const BASE = "body{margin:0} main{width:280px;padding:16px;font:16px system-ui;background:#fff;color:#111} .note{color:#555} .badge{display:inline-block;padding:2px 6px;background:rgb(0,122,255);color:#fff}";

/** Names of `Color(light:dark:)` tokens in MarkswiftTokens.swift. */
function adaptiveTokens(result: ConversionResult): string[] {
  return [...result.files["MarkswiftTokens.swift"]!.matchAll(/static let (\w+) = Color\(light:/g)].map((m) => m[1]!);
}

function expectAdaptive(result: ConversionResult) {
  const names = adaptiveTokens(result);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(result.code).toContain(`Color.${name}`);
  // The light literals the dark styles change are gone from the view.
  expect(result.code).not.toContain("Color.markswift(1.0, 1.0, 1.0))");
  expect(result.darkLayout?.combo.theme).toBe("dark");
  expect(result.warnings).toEqual([]);
  expect(result.code).toContain('#Preview("Account — Dark")');
}

browserTest("prefers-color-scheme dark styles become adaptive tokens the view references", async () => {
  const css = `${BASE} @media (prefers-color-scheme: dark){main{background:#16181d;color:#f2f2f2}.note{color:#a0a4ab}}`;
  expectAdaptive(await convertHtml(HTML, { name: "Account", css }));
}, 60000);

browserTest("class-based dark themes need darkClass and then become adaptive tokens", async () => {
  const css = `${BASE} .dark main{background:#16181d;color:#f2f2f2} .dark .note{color:#a0a4ab}`;
  expectAdaptive(await convertHtml(HTML, { name: "Account", css, darkClass: "dark" }));
  expect(adaptiveTokens(await convertHtml(HTML, { name: "Account", css }))).toEqual([]);
}, 60000);

browserTest("a page without dark styles produces only static tokens", async () => {
  const result = await convertHtml(HTML, { name: "Account", css: BASE });
  expect(adaptiveTokens(result)).toEqual([]);
  expect(result.files["MarkswiftTokens.swift"]).toMatch(/\/\/ \d+ tokens: 0 adaptive \(light\/dark pairs\), \d+ static\./);
  expect(result.warnings).toEqual([]);
}, 60000);
