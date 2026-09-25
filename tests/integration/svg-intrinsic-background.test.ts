import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const url = (svg: string) => "data:image/svg+xml," + encodeURIComponent(svg);

browserTest("viewBox-only SVG has 75×150 img natural size but auto background tiles at 90×180", async () => {
  const src = url('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"><rect width="100" height="200" fill="#9333ea"/><circle cx="50" cy="50" r="30" fill="#fbbf24"/></svg>');
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const natural = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, src);
    expect(natural).toEqual([75, 150]);
    await page.setContent(`<body style="margin:0"><div style="width:180px;height:180px;background-image:url('${src}');background-repeat:repeat;background-size:auto"></div></body>`);
    const shot = await sharp(await page.locator("div").screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (45 * shot.info.width + 150) * 4;
    // The second circle lands at x=135 only if the tile is 90px wide; a 75px tile
    // leaves this pixel purple.
    expect([...shot.data.subarray(offset, offset + 3)]).toEqual([251, 191, 36]);
  } finally { await browser.close(); }

  const result = await convertHtml(`<div data-markswift-root id="tile" style="width:180px;height:180px;background-image:url('${src}');background-size:auto;background-repeat:repeat"></div>`, { name: "NaturalTile" });
  expect(result.code).toContain("tile: CGSize(width: 90.0, height: 180.0)");
  expect(result.code).toContain(".frame(width: 90.0, height: 180.0)");
  expect(result.diagnostics.find(item => item.id === "#tile")).toBeUndefined();
}, 30_000);

browserTest("non-positive SVG natural width leaves auto background blank but permits explicit sizing", async () => {
  const src = url('<svg xmlns="http://www.w3.org/2000/svg" width="-5" height="160" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000"/></svg>');
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 110 } });
    await page.setContent(`<body style="margin:0"><img src="${src}" style="width:110px;height:110px;position:absolute;left:0;top:0"><div style="width:110px;height:110px;position:absolute;left:120px;top:0;background-image:url('${src}');background-size:auto;background-repeat:no-repeat"></div><div style="width:110px;height:110px;position:absolute;left:240px;top:0;background-image:url('${src}');background-size:110px 110px;background-repeat:no-repeat"></div></body>`);
    const natural = await page.locator("img").evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]);
    expect(natural).toEqual([0, 160]);
    const shot = await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...shot.data.subarray((y * shot.info.width + x) * 4, (y * shot.info.width + x) * 4 + 3)];
    expect(pixel(50, 50)).toEqual([255, 0, 0]);
    expect(pixel(170, 50)).toEqual([255, 255, 255]);
    expect(pixel(290, 50)).toEqual([255, 0, 0]);
  } finally { await browser.close(); }

  const result = await convertHtml(`<main data-markswift-root style="width:360px;display:flex;gap:10px"><img id="sized" src="${src}" alt="sized" style="width:110px;height:110px;flex:none"><div id="auto" style="width:110px;height:110px;flex:none;background-image:url('${src}');background-size:auto;background-repeat:no-repeat"></div><div id="explicit" style="width:110px;height:110px;flex:none;background-image:url('${src}');background-size:110px 110px;background-repeat:no-repeat"></div></main>`, { name: "InvalidSvgSize" });
  expect(result.code).toContain("MarkswiftShape_");
  expect(result.code).not.toContain('Text(verbatim: "sized")');
  expect(result.diagnostics.find(item => item.id === "#sized")?.notes.join(" ")).toContain("non-positive");
  expect(result.diagnostics.find(item => item.id === "#auto")?.notes.join(" ")).toContain("layer dropped");
  expect(result.diagnostics.find(item => item.id === "#explicit")?.notes.join(" ")).toContain("non-positive");
  expect(result.diagnostics.find(item => item.id === "#explicit")?.notes.join(" ")).not.toContain("layer dropped");
}, 30_000);

browserTest("SVG root em size with custom font is explicitly approximated for img and background", async () => {
  const src = url('<svg xmlns="http://www.w3.org/2000/svg" style="font-size:20px" width="10em" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000"/></svg>');
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const natural = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, src);
    expect(natural).toEqual([200, 100]);
  } finally { await browser.close(); }

  const result = await convertHtml(`<main data-markswift-root style="width:220px;display:flex;gap:10px"><img id="relative-img" src="${src}" style="width:100px;height:100px"><div id="relative-bg" style="width:100px;height:100px;background-image:url('${src}');background-size:auto;background-repeat:no-repeat"></div></main>`, { name: "RelativeSvgSize" });
  for (const id of ["#relative-img", "#relative-bg"])
    expect(result.diagnostics.find(item => item.id === id)?.notes.join(" ")).toContain("assumes 16px font size");
}, 30_000);
