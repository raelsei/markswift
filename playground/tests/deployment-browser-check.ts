import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.MARKSWIFT_PLAYGROUND_URL ?? "http://127.0.0.1:4321";
const output = join(import.meta.dir, "../.cache/checks");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#connection-status[data-state="ready"]').waitFor();
  await page.locator("#sample").click();
  await page.locator("#convert").click();
  await page.locator("#code-view").waitFor({ state: "visible", timeout: 45_000 });
  if (!(await page.locator("#code").textContent())?.includes("struct PreviewCard")) throw new Error("Swift source missing");
  if (base.includes(":4323")) {
    if (await page.locator(".native-panel").isVisible()) throw new Error("Static deployment exposed local simulator controls");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    await download.saveAs(join(output, "static-component.zip"));
    let externalRequests = 0;
    await page.route("**/blocked-probe", route => { externalRequests++; return route.fulfill({ body: "unexpected" }); });
    await page.locator("#css-tab").click();
    await page.locator("#css").fill("");
    await page.locator("#html-tab").click();
    await page.locator("#html").fill('<!doctype html><html><head><style>body{background:rgb(12,34,56)}</style></head><body><main id="full-page">Full page</main><img src="http://127.0.0.1:4323/blocked-probe"></body></html>');
    await page.waitForTimeout(350);
    const preview = page.frameLocator("#preview");
    if (await preview.locator("#full-page").textContent() !== "Full page") throw new Error("Full HTML document did not preview");
    const background = await preview.locator("body").evaluate(element => getComputedStyle(element).backgroundColor);
    if (background !== "rgb(12, 34, 56)") throw new Error(`Full HTML styles were lost: ${background}`);
    if (externalRequests !== 0) throw new Error("Pasted HTML requested an external resource");
    await page.locator("#sample").click();
  }
  await page.screenshot({ path: join(output, "new-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "new-mobile.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`${width}px mobile page overflows horizontally`);
  }
  if (base.includes(":4323")) {
    await page.route('**/api/capabilities', route => route.abort());
    await page.reload();
    await page.locator('#connection-status[data-state="offline"]').waitFor();
    if (!(await page.locator('#convert').isDisabled())) throw new Error("Conversion button stayed enabled while API was offline");
    if (!(await page.locator('#preview').isVisible())) throw new Error("Browser preview disappeared while API was offline");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Desktop and mobile conversion UI passed");
} finally { await browser.close(); }
