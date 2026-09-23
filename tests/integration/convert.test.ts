import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import type { Browser } from "playwright-core";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;
const css = "html,body{margin:0} .card,.p-4,._card_ab12{box-sizing:border-box;width:240px;height:80px;padding:16px;background:rgb(255,0,0);font:16px system-ui}";

browserTest("documents, fragments, compiled utility and module CSS use the same conversion", async () => {
  const sources = [
    { html: '<main data-markswift-root class="card">Hello</main>' },
    { html: '<!doctype html><html><head><title>Example</title></head><body><main data-h2s-root class="p-4">Hello</main></body></html>' },
    { html: '<main data-h2s-root class="_card_ab12">Hello</main>' },
  ];
  const results = await Promise.all(sources.map(source => convert(source, { name: "CardView", css })));
  for (const result of results) {
    expect(result.layout.size).toEqual({ w: 240, h: 80 });
    expect(result.code).toContain("Hello");
    expect(result.warnings).toEqual([]);
  }
  expect(results[1]!.code).toBe(results[0]!.code);
  expect(results[2]!.code).toBe(results[0]!.code);
}, 60000);

browserTest("file and inline assetsDir inputs embed local image resources before server cleanup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-api-test-"));
  try {
    await Bun.write(join(directory, "photo.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="red"/></svg>');
    await Bun.write(join(directory, "style.css"), "body{margin:0}main{width:100px;height:100px;background-image:url(photo.svg)}img{width:20px;height:20px}");
    const html = '<link rel="stylesheet" href="style.css"><main data-h2s-root><img src="photo.svg"></main>';
    const file = join(directory, "card with spaces.html");
    await Bun.write(file, html);
    for (const source of [{ file }, { html, assetsDir: directory }]) {
      const result = await convert(source, { name: "LocalCard" });
      expect(result.layout.size).toEqual({ w: 100, h: 100 });
      expect(result.warnings).toEqual([]);
      expect(result.code).not.toContain("127.0.0.1");
      expect(JSON.stringify(result.layout)).toContain("data:image/svg+xml;base64,");
      expect(result.files["MarkswiftShapes.swift"]).toContain("Shape");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

browserTest("URL capture, preparation hook and explicit root work together", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response('<div id="card" style="width:123px;height:45px">Before</div>', { headers: { "content-type": "text/html" } }) });
  try {
    const result = await convert({ url: `http://127.0.0.1:${server.port}/` }, {
      root: "#card", prepare: async page => { await page.locator("#card").evaluate(el => { el.textContent = "After"; }); },
    });
    expect(result.layout.size).toEqual({ w: 123, h: 45 });
    expect(result.code).toContain("After");
  } finally { server.stop(true); }
}, 30000);

browserTest("resource failures are returned to the caller", async () => {
  const result = await convertHtml('<main data-h2s-root style="width:100px;height:50px"><img src="/missing.png" width="20" height="20" alt="Missing"></main>');
  expect(result.warnings.some(message => message.includes("missing.png"))).toBe(true);
}, 30000);

browserTest("restricted pasted HTML cannot run scripts or request server-side resources", async () => {
  let requests = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { requests++; return new Response("blocked"); } });
  try {
    const remote = `http://127.0.0.1:${server.port}`;
    const html = `<style>@font-face{font-family:Probe;src:url(${remote}/font.woff2)}main{font-family:Probe}</style>`
      + `<main data-markswift-root style="width:180px;height:80px">Original<img src="${remote}/pixel.png"></main>`
      + `<script>document.querySelector("main").textContent="Executed";fetch("${remote}/script")</script>`;
    const result = await convertHtml(html, { name: "RestrictedView", untrustedInput: true });
    expect(result.code).toContain("Original");
    expect(result.code).not.toContain("Executed");
    expect(requests).toBe(0);
  } finally { server.stop(true); }
}, 30000);

browserTest("a failed preparation closes the browser and local asset server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cleanup-test-"));
  let origin = "";
  const handles: { browser?: Browser | null } = {};
  try {
    await expect(convert({ html: "<main>Failure case</main>", assetsDir: directory }, {
      async prepare(page) {
        origin = new URL(page.url()).origin;
        handles.browser = page.context().browser();
        throw new Error("intentional preparation failure");
      },
    })).rejects.toThrow("intentional preparation failure");
    expect(handles.browser).toBeDefined();
    expect(handles.browser!.isConnected()).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);

test("invalid API options fail before browser startup", async () => {
  await expect(convertHtml("<div/>", { name: "Text" })).rejects.toThrow();
  await expect(convertHtml("<div/>", { viewport: { width: 0, height: 100 } })).rejects.toThrow();
  await expect(convert({ url: "file:///private/file.html" })).rejects.toThrow("http");
  await expect(convert({ url: "https://example.com" }, { untrustedInput: true })).rejects.toThrow("pasted HTML");
  await expect(convert({ html: "<main>Hi</main>", assetsDir: "." }, { untrustedInput: true })).rejects.toThrow("assetsDir");
});
