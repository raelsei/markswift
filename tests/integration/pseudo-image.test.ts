import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("a single CSS generated image reaches Swift through its measured pseudo box", async () => {
  const imageUrl = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#ff0000"/></svg>');
  const html = `<!doctype html><style>
    p::before { content: url("${imageUrl}"); display:inline-block; width:20px; height:20px; }
  </style><p data-markswift-root>Text after icon</p>`;
  const result = await convertHtml(html, { name: "PseudoImage" });
  const pseudo = result.layout.root.children.find(child => child.tag === "::before");
  expect(pseudo?.styles.content).toContain("url(");
  expect(pseudo?.children[0]).toMatchObject({ tag: "img", bounds: pseudo?.bounds });
  expect(pseudo?.children[0]?.attrs["data-h2s-src"]).toMatch(/^data:image\/svg\+xml,/);
  expect(result.code).toContain("MarkswiftShape_");
  expect(result.warnings.some(warning => warning.includes("::before") && warning.includes("generated image"))).toBe(false);
}, 30000);

browserTest("generated image uses the pseudo content box inside padding and border", async () => {
  const src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#ff0000"/></svg>');
  const result = await convertHtml(`<style>p::before{content:url("${src}");position:absolute;left:10px;top:10px;width:20px;height:20px;padding:4px;border:2px solid #ffffff;box-sizing:content-box}</style><p data-markswift-root style="position:relative;width:100px;height:60px;margin:0"></p>`, { name: "PaddedPseudo" });
  const pseudo = result.layout.root.children.find(child => child.tag === "::before");
  expect(pseudo?.bounds).toEqual({ x: 10, y: 10, w: 32, h: 32 });
  expect(pseudo?.children[0]?.bounds).toEqual({ x: 16, y: 16, w: 20, h: 20 });
  expect(result.code).toContain("MarkswiftShape_");
}, 30000);

browserTest("same-origin generated image is embedded before its local server closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-pseudo-image-"));
  try {
    await Bun.write(join(directory, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#ff0000"/></svg>');
    const result = await convert({ html: `<style>p::before{content:url(icon.svg);display:inline-block;width:20px;height:20px}</style><p data-markswift-root>Text</p>`, assetsDir: directory }, { name: "PseudoAsset" });
    const pseudo = result.layout.root.children.find(child => child.tag === "::before");
    expect(pseudo?.children[0]?.attrs["data-h2s-src"]).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.code).not.toContain("127.0.0.1");
    expect(result.warnings).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);

browserTest("complex generated image content stays explicitly diagnosed", async () => {
  const result = await convertHtml(`<style>p::before{content:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'/%3E") "label";display:inline-block;width:20px;height:20px}</style><p data-markswift-root>Text</p>`, { name: "ComplexPseudo" });
  expect(result.warnings.some(warning => warning.includes("::before") && warning.includes("generated image"))).toBe(true);
}, 30000);

browserTest("quoted pseudo text mentioning url is not mistaken for an image", async () => {
  const result = await convertHtml(`<!doctype html><style>
    p::before { content: "url(icon.png)"; display:inline-block; width:100px; height:20px; }
  </style><p data-markswift-root>Text</p>`, { name: "PseudoText" });
  expect(result.code).toContain("url(icon.png)");
  expect(result.warnings.some(warning => warning.includes("generated image"))).toBe(false);
}, 30000);
