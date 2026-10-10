import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const directory = join(import.meta.dir, "../.cache/checks");
const base = process.env.MARKSWIFT_PLAYGROUND_URL ?? "http://127.0.0.1:4317";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ colorScheme: null, viewport: { width: 1536, height: 1050 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Load sample" }).click();
  await page.getByRole("button", { name: "Convert to SwiftUI" }).click();
  await page.locator("#code-view").waitFor({state:"visible",timeout:45_000});
  if (!(await page.locator("#code").textContent())?.includes("struct PreviewCard")) throw Error("Missing generated Swift");
  console.log("UI conversion passed");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  await download.saveAs(join(directory,"PreviewCard.zip"));
  console.log("ZIP download passed");
  await page.locator("#render").click();
  await page.waitForFunction(() => document.querySelector('#native-status')?.textContent === 'Native render complete' || document.querySelector('#native-status')?.textContent === 'Render failed', { }, {timeout:260_000});
  if ((await page.locator("#native-status").textContent()) !== "Native render complete") throw Error(await page.locator("#notice").textContent() ?? "Render failed");
  await page.waitForFunction(() => {const img=document.querySelector<HTMLImageElement>('#native-image');return img?.complete && img.naturalWidth>0;});
  console.log("Native image loaded");
  await page.screenshot({path:join(directory,"desktop.png"),fullPage:true});
  const imageURL = await page.locator("#native-image").getAttribute("src");
  const response=await page.request.get(base+imageURL);
  await Bun.write(join(directory,"native.png"),await response.body());
  await page.locator("#html").fill("<div>Changed</div>");
  if (!(await page.locator("#render").isDisabled()) || await page.locator("#native-frame").isVisible()) throw Error("Stale preview not invalidated");
  console.log("Stale output invalidation passed");
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(directory,"mobile.png"),fullPage:true});
  if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error("Mobile page overflows horizontally");
  if(errors.length)throw Error(errors.join('\n'));
  console.log("Responsive layout and browser console passed");
} finally {await browser.close();}
