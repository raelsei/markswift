import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

declare global {
  interface Window {
    __csp: string[];
  }
}

const base = process.env.MARKSWIFT_PLAYGROUND_URL ?? "http://127.0.0.1:4321";
const output = join(import.meta.dir, "../.cache/checks");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective));
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const assertNoCspViolations = async () => {
    const violations = await page.evaluate(() => window.__csp);
    if (violations.length) throw new Error(`Content-Security-Policy violations: ${violations.join(", ")}`);
  };
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    return dialog.accept();
  });
  const loadSample = async () => {
    const before = dialogs;
    await page.locator("#sample").click();
    return dialogs > before;
  };
  const convert = async () => {
    await page.locator("#convert").click();
    await page.locator('body[data-stale="false"] #code-view').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator("#convert:not([disabled])").waitFor({ timeout: 45_000 });
  };

  await page.goto(base);
  await page.locator('#connection-status[data-state="ready"]').waitFor();
  await loadSample();
  await convert();
  if (!(await page.locator("#code").textContent())?.includes("struct PreviewCard"))
    throw new Error("Swift source missing");
  if ((await page.locator('#file-tabs [aria-selected="true"]').getAttribute("data-file")) !== "PreviewCard.swift")
    throw new Error("Component file is not the selected tab");
  if (!(await page.locator("#fidelity").isVisible())) throw new Error("Fidelity summary missing");
  if (!/No approximations|approximated|unmapped/.test((await page.locator("#fidelity").textContent()) ?? ""))
    throw new Error("Fidelity summary has no level");
  await page.locator("#copy-all").click();
  await page.locator("#copy-all", { hasText: "Copied" }).waitFor();
  if (!(await page.evaluate(() => navigator.clipboard.readText())).includes("// MARK: - MarkswiftRuntime.swift"))
    throw new Error("Copy all missed the runtime file");

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  await download.saveAs(join(output, "component.zip"));
  if (download.suggestedFilename() !== "PreviewCard.zip")
    throw new Error(`Unexpected download name ${download.suggestedFilename()}`);

  if (base.includes(":4323")) {
    if (await page.locator(".native-panel").isVisible())
      throw new Error("Static deployment exposed local simulator controls");
    let externalRequests = 0;
    await page.route("**/blocked-probe", (route) => {
      externalRequests++;
      return route.fulfill({ body: "unexpected" });
    });
    await page.locator("#css-tab").click();
    await page.locator("#css").fill("");
    await page.locator("#html-tab").click();
    await page
      .locator("#html")
      .fill(
        '<!doctype html><html><head><style>body{background:rgb(12,34,56)}</style></head><body><main id="full-page">Full page</main><img src="http://127.0.0.1:4323/blocked-probe"></body></html>',
      );
    await page.waitForTimeout(350);
    const preview = page.frameLocator("#preview");
    if ((await preview.locator("#full-page").textContent()) !== "Full page")
      throw new Error("Full HTML document did not preview");
    const background = await preview.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor);
    if (background !== "rgb(12, 34, 56)") throw new Error(`Full HTML styles were lost: ${background}`);
    if (externalRequests !== 0) throw new Error("Pasted HTML requested an external resource");
    await loadSample();
  }

  // An edit keeps the last result and marks it stale.
  await page.locator("#html").fill("<div>Changed</div>");
  if (!(await page.locator("#code").textContent())?.includes("struct PreviewCard"))
    throw new Error("Edit discarded the generated Swift");
  if ((await page.evaluate(() => document.body.dataset.stale)) !== "true")
    throw new Error("Output not marked stale after an edit");
  if (!(await page.locator("#download").isDisabled())) throw new Error("Stale output still offers download");
  if (!(await page.locator("#stale").isVisible())) throw new Error("Stale notice missing");
  if (!(await loadSample())) throw new Error("Load sample replaced edited HTML without confirmation");
  if ((await page.locator("#html").inputValue()) === "<div>Changed</div>")
    throw new Error("Sample did not replace the edited HTML");
  await convert();

  // An expired download reports in-page instead of navigating to raw JSON.
  const url = page.url();
  await page.route("**/api/download/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Conversion expired. Convert again to download." }),
    }),
  );
  await page.locator("#download").click();
  await page.locator("#notice", { hasText: "expired" }).waitFor();
  if (page.url() !== url) throw new Error("Expired download navigated away");
  await page.unroute("**/api/download/**");

  // A failed request marks the converter offline; Retry recovers it.
  await page.route("**/api/convert", (route) => route.abort());
  await page.locator("#convert").click();
  await page.locator('#connection-status[data-state="offline"]').waitFor();
  if (!(await page.locator("#retry").isVisible())) throw new Error("Retry missing while offline");
  await page.unroute("**/api/convert");
  await page.locator("#retry").click();
  await page.locator('#connection-status[data-state="ready"]').waitFor();

  await page.screenshot({ path: join(output, "new-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "new-mobile.png"), fullPage: true });
  if ((await page.locator("#html").evaluate((element) => getComputedStyle(element).fontSize)) !== "16px")
    throw new Error("Mobile source editor zooms on focus");
  if (((await page.locator("#convert").boundingBox())?.height ?? 0) < 44)
    throw new Error("Mobile convert button is below 44px");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`${width}px mobile page overflows horizontally`);
  }
  await assertNoCspViolations();
  if (base.includes(":4323")) {
    await page.route("**/api/capabilities", (route) => route.abort());
    await page.reload();
    await page.locator('#connection-status[data-state="offline"]').waitFor();
    if (!(await page.locator("#convert").isDisabled()))
      throw new Error("Conversion button stayed enabled while API was offline");
    if (!(await page.locator("#preview").isVisible()))
      throw new Error("Browser preview disappeared while API was offline");
    await assertNoCspViolations();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Desktop and mobile conversion UI passed");
} finally {
  await browser.close();
}
