import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("inline and separately supplied CSS report distinct nested media conditions once", async () => {
  const result = await convertHtml(`<!doctype html><style>
    @media (min-width: 360px) { .card { color: red } @supports (display: grid) { @media (prefers-color-scheme: dark) { .card { color: white } } } }
    @media (min-width: 360px) { .card { font-weight: bold } }
  </style><main data-markswift-root class="card">Card</main>`, {
    name: "MediaCard", css: "@media (max-width: 600px) { .card { padding: 8px } }",
  });
  const warnings = result.warnings.filter(warning => warning.includes("@media"));
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("min-width: 360px");
  expect(warnings[0]).toContain("prefers-color-scheme: dark");
  expect(warnings[0]).toContain("max-width: 600px");
  expect(warnings[0]!.match(/min-width: 360px/g)).toHaveLength(1);
  expect(warnings[0]).toContain("Swift");
}, 30_000);

browserTest("media rules in accessible imported CSS are included", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-media-"));
  try {
    await writeFile(join(directory, "outer.css"), '@import url("inner.css") screen and (min-width: 300px); .card { color: red }');
    await writeFile(join(directory, "inner.css"), '@supports (display: grid) { @media (orientation: portrait) { .card { display: grid } } }');
    const result = await convert({ html: '<link rel="stylesheet" href="outer.css"><main data-markswift-root class="card">Card</main>', assetsDir: directory }, { name: "ImportedMedia" });
    const warning = result.warnings.find(value => value.includes("@media"));
    expect(warning).toContain("min-width: 300px");
    expect(warning).toContain("orientation: portrait");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);

browserTest("plain CSS and capture harness rules produce no media warning", async () => {
  const result = await convertHtml('<style>.card{color:red}</style><main data-markswift-root class="card">Card</main>', {
    name: "PlainCard", css: ".card { padding: 8px }",
    prepare: async page => {
      const harness = await page.addStyleTag({ content: "@media (min-width: 1px) { .card { opacity: 1 } }" });
      await harness.evaluate(node => (node as Element).setAttribute("data-h2s-harness", ""));
    },
  });
  expect(result.warnings.some(warning => warning.includes("@media"))).toBe(false);
}, 30_000);
