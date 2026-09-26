import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPlaygroundHandler, HTTP_IDLE_TIMEOUT_SECONDS } from "../service/app.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("playground routes both-width controls to the real API and supports returning to single capture", async () => {
  const web = fileURLToPath(new URL("../web/", import.meta.url));
  const handler = createPlaygroundHandler();
  const requests: Record<string, unknown>[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/convert") {
        requests.push(await request.clone().json() as Record<string, unknown>);
        return handler(request);
      }
      if (path === "/health") return handler(request);
      const file = Bun.file(resolve(web, `.${path === "/" ? "/index.html" : path}`));
      return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    },
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.url.toString());
    await page.waitForFunction(() => document.getElementById("service-label")?.textContent === "Converter ready");
    expect(await page.locator("#layout").inputValue()).toBe("single");
    expect(await page.locator("#responsive-options").isVisible()).toBe(false);
    await page.locator("#html-input").fill('<main data-markswift-root><h1>Hello</h1><p class="wide">Wide details</p></main>');
    await page.locator("#css-tab").click();
    await page.locator("#css-input").fill("body{margin:0}main{padding:16px;background:#eef2f6}@media(max-width:350px){.wide{display:none}}");
    await page.locator("#view-name").fill("ResponsiveDemo");
    await page.locator("#viewport-height").fill("420");
    await page.locator("#layout").selectOption("responsive");
    expect(await page.locator("#responsive-options").isVisible()).toBe(true);
    expect(await page.locator("#viewport-label").textContent()).toBe("Regular viewport");
    await page.locator("#breakpoint").fill("393");
    await page.locator("#convert-button").click();
    expect(await page.locator("#status-message").textContent()).toContain("Compact width ≤ breakpoint < regular width");
    expect(requests).toHaveLength(0);
    await page.locator("#breakpoint").fill("350");
    await page.locator("#convert-button").click();
    await page.waitForFunction(() => document.getElementById("status-message")?.textContent?.startsWith("Generated "), null, { timeout: 30_000 });
    expect(requests[0]).toMatchObject({ name: "ResponsiveDemo", compactWidth: 320, breakpoint: 350, viewport: { width: 393, height: 420 } });
    expect(requests[0]!.untrustedInput).toBeUndefined();
    expect(await page.locator("#file-select").inputValue()).toBe("ResponsiveDemo.swift");
    expect(await page.locator("#swift-code").textContent()).toContain("MarkswiftResponsiveLayout(breakpoint: 350)");
    expect(await page.locator("#file-select").textContent()).toContain("ResponsiveDemoCompact.swift");
    expect(await page.locator("#file-select").textContent()).toContain("ResponsiveDemoRegular.swift");
    expect(await page.locator("#mapping-summary").textContent()).toMatch(/^Compact \d+\/\d+ · Regular \d+\/\d+ mapped$/);
    expect(await page.locator("#download-bundle").isEnabled()).toBe(true);
    await page.locator("#report-tab").click();
    const report = await page.locator("#report-content").textContent();
    expect(report).toContain("Compact · 320 × 420 px");
    expect(report).toContain("Regular · 393 × 420 px");
    expect(report).toContain("intermediate widths");
    expect(report).toContain("not measure visual similarity");
    expect(report).toContain("sampled at compact 320px and regular 393px");
    expect(report).toContain("Combined browser and asset warnings");
    await page.locator("#preview-tab").click();
    await page.locator("#preview-width").selectOption("compact");
    expect(await page.locator("#html-preview").evaluate(frame => (frame as HTMLElement).style.width)).toBe("320px");
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator("#layout").selectOption("single");
    expect(await page.locator("#responsive-options").isVisible()).toBe(false);
    expect(await page.locator("#preview-width-setting").isVisible()).toBe(false);
    expect(await page.locator("#mapping-summary").textContent()).toBe("Previous result · convert again");
    await page.locator("#convert-button").click();
    await page.waitForFunction(() => document.getElementById("mapping-summary")?.textContent?.includes("% nodes"), null, { timeout: 30_000 });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.compactWidth).toBeUndefined();
    expect(requests[1]!.breakpoint).toBeUndefined();
    expect(await page.locator("#file-select").textContent()).not.toContain("ResponsiveDemoCompact.swift");
    expect(await page.locator("#report-content").textContent()).not.toContain("Combined browser and asset warnings");
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    server.stop(true);
  }
}, 60_000);
