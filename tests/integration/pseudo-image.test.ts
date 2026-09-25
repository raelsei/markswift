import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("CSS generated image content is reported when its pseudo box cannot be painted", async () => {
  const html = `<!doctype html><style>
    p::before { content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='red'/%3E%3C/svg%3E"); display:inline-block; width:20px; height:20px; }
  </style><p data-markswift-root>Text after icon</p>`;
  const result = await convertHtml(html, { name: "PseudoImage" });
  const pseudo = result.layout.root.children.find(child => child.tag === "::before");
  expect(pseudo?.styles.content).toContain("url(");
  expect(result.warnings.some(warning => warning.includes("::before") && warning.includes("generated image"))).toBe(true);
}, 30000);

browserTest("quoted pseudo text mentioning url is not mistaken for an image", async () => {
  const result = await convertHtml(`<!doctype html><style>
    p::before { content: "url(icon.png)"; display:inline-block; width:100px; height:20px; }
  </style><p data-markswift-root>Text</p>`, { name: "PseudoText" });
  expect(result.code).toContain("url(icon.png)");
  expect(result.warnings.some(warning => warning.includes("generated image"))).toBe(false);
}, 30000);
