/** Plan 054: `convert({ breakpoints })` emits one view that switches at the CSS width thresholds. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import type { ConversionResult } from "../../src/api/types.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { typecheckLoose } from "../../tools/verify/typecheck-loose.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const native = process.env.MARKSWIFT_SWIFT_TESTS === "1";

const MEDIA_QUERY = { file: "tests/conformance/fixtures/css-layout/media-query.html" };
const FLUID = "main[data-markswift-root]{width:auto!important}";
// Bodies of 056's breakpoint fixtures.
const SWAP = `<style>body{margin:0;font:15px/20px system-ui} main{padding:16px} .cards .c{border:1px solid #ccc;border-radius:8px;padding:8px;margin-bottom:8px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:4px} .side{display:none} @media (min-width:1024px){ .layout{display:flex;gap:16px} .side{display:block;width:200px;background:#eef} .top{display:none} } @media (min-width:768px){ .cards{display:none} } @media (max-width:767px){ table{display:none} }</style><main data-markswift-root><div class="layout"><nav class="side"><a href="#a">Home</a><br><a href="#b">Settings</a></nav><div class="content"><nav class="top"><a href="#a">Home</a> · <a href="#b">Settings</a></nav><h1 id="title">Orders</h1><div class="cards"><div class="c"><b>#1</b> Alice — $10</div><div class="c"><b>#2</b> Bob — $20</div></div><table><tr><th>Id</th><th>Name</th><th>Total</th></tr><tr><td>1</td><td>Alice</td><td>$10</td></tr><tr><td>2</td><td>Bob</td><td>$20</td></tr></table><label>Note <input id="note" value="hi"></label></div></div></main>`;
const JS_SWAP = `<style>body{margin:0;font:15px system-ui} @media (min-width:768px){main{padding:0}}</style><main data-markswift-root><p>intro</p><p>after</p><button>Go</button></main><script>if (innerWidth>=768) document.querySelector('main').insertAdjacentHTML('afterbegin','<header>Wide header</header>');</script>`;
const MAXW = "main[data-markswift-root]{width:auto!important;max-width:700px;margin:0 auto}";

async function typechecks(result: ConversionResult): Promise<void> {
  if (!native) return;
  const directory = await mkdtemp(join(tmpdir(), "markswift-breakpoints-"));
  try {
    for (const [file, source] of Object.entries(result.files))
      if (file.endsWith(".swift")) await Bun.write(join(directory, file), source);
    for (const check of [await typecheck(directory), await typecheckLoose(directory)])
      if (!check.ok) throw new Error(check.output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

browserTest(
  "media-query: one view switching at 600px, the width query no longer reported",
  async () => {
    const result = await convert(MEDIA_QUERY, { css: FLUID, theme: "light", breakpoints: true });
    expect(result.code).toContain("MarkswiftBands(edges: [.atLeast(600.0)])");
    expect(result.warnings.filter((w) => w.message.includes("(min-width: 600px)"))).toEqual([]);
    await typechecks(result);
  },
  180000,
);

browserTest(
  "swap: the max-width edge merges into 768; one @State and one action per element",
  async () => {
    const result = await convertHtml(SWAP, { theme: "light", breakpoints: true });
    expect(result.code).toContain("MarkswiftBands(edges: [.atLeast(768.0), .atLeast(1024.0)])");
    expect(result.code.match(/@State private var s_note\b/g)).toHaveLength(1);
    // Both Home links target `#a`: one callback, named after the target, across every band.
    expect(result.code.match(/var onA\b/g)).toHaveLength(1);
    expect(result.code.match(/@MarkswiftFocused private var/g)).toHaveLength(1);
    await typechecks(result);
  },
  180000,
);

browserTest(
  "js-swap: script-driven DOM is emitted once per band and reported",
  async () => {
    const result = await convertHtml(JS_SWAP, { theme: "light", breakpoints: true });
    const reported = result.warnings.filter((w) => w.source === "breakpoints");
    expect(reported).toHaveLength(1);
    expect(reported[0]!.message).toContain("script-driven DOM differs");
  },
  180000,
);

browserTest(
  "maxw: a centred max-width root keeps the CSS edges",
  async () => {
    const result = await convert(MEDIA_QUERY, { css: MAXW, theme: "light", breakpoints: true });
    expect(result.code).toContain("MarkswiftBands(edges: [.atLeast(600.0)])");
  },
  180000,
);

browserTest(
  "a fixed-width root gets no breakpoints, and the warning says so",
  async () => {
    const result = await convert(MEDIA_QUERY, { theme: "light", breakpoints: true });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        source: "breakpoints",
        message: expect.stringContaining("does not follow the viewport width"),
      }),
    );
    const plain = await convert(MEDIA_QUERY, { theme: "light" });
    expect(result.code).toBe(plain.code);
  },
  180000,
);

browserTest(
  "layers: band 0's disclosure joins the merged view once; band captures carry no layers",
  async () => {
    const result = await convertHtml(
      `<style>.side{display:none} @media (min-width:768px){.side{display:block}}</style><main data-markswift-root><div class="wrap"><aside class="side">Side</aside><p>Text</p></div><details><summary>More</summary><p>Answer</p></details></main>`,
      { breakpoints: true, theme: "light" },
    );
    expect(result.layout.layers).toHaveLength(1);
    expect(result.bands![1]!.layout.layers).toBeUndefined();
    expect(result.code.match(/@State private var isMoreExpanded\b/g)).toHaveLength(1);
    await typechecks(result);
  },
  180000,
);

browserTest(
  "swap: the breakpoint view's init is the single capture's",
  async () => {
    const init = (code: string) => code.split("\n").find((l) => l.startsWith("    init("));
    const bands = await convertHtml(SWAP, { theme: "light", breakpoints: true });
    const single = await convertHtml(SWAP, { theme: "light" });
    expect(init(bands.code)).toBeDefined();
    expect(init(bands.code)).toBe(init(single.code)!);
    expect(bands.code.match(/@State private var s_note\b/g)).toHaveLength(1);
  },
  180000,
);
