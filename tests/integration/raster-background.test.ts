import { expect, test } from "bun:test";
import sharp from "sharp";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("PNG background-size auto preserves right-bottom placement", async () => {
  const png = await sharp({ create: { width: 32, height: 16, channels: 4, background: "#ff0000" } }).png().toBuffer();
  const src = `data:image/png;base64,${png.toString("base64")}`;
  const result = await convertHtml(`<div data-markswift-root id="tile" style="width:200px;height:100px;background:#ffffff url('${src}') no-repeat right bottom / auto"></div>`, { name: "RasterBackground" });
  const image = inferScreen(result.layout, "RasterBackground").root.style.fills.find(fill => fill.kind === "image");
  expect(image).toEqual(expect.objectContaining({ size: { w: 32, h: 16 }, position: [168, 84] }));
  expect(result.code).toContain(".frame(width: 32.0, height: 16.0)");
  expect(result.code).toContain(".offset(x: 168.0, y: 84.0)");
}, 30_000);
