import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import { convertResponsive } from "../../src/index.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;
const sizes = {
  compact: { viewport: { width: 320, height: 568 } },
  regular: { viewport: { width: 390, height: 844 } },
};

test("responsive API rejects invalid names, viewports, breakpoints and untrusted sources before browser startup", async () => {
  const source = { html: "<main data-markswift-root>Card</main>" };
  const options = { name: "CardView", breakpoint: 350, ...sizes };
  await expect(convertResponsive(source, { ...options, name: "invalid-name" })).rejects.toThrow("name");
  await expect(convertResponsive(source, { ...options, compact: { viewport: { width: 0, height: 568 } } })).rejects.toThrow("viewport");
  await expect(convertResponsive(source, { ...options, breakpoint: 319 })).rejects.toThrow("breakpoint");
  await expect(convertResponsive(source, { ...options, breakpoint: 390 })).rejects.toThrow("breakpoint");
  await expect(convertResponsive(source, { ...options, dpr: 0 })).rejects.toThrow("dpr");
  await expect(convertResponsive({ url: "https://example.com" }, { ...options, untrustedInput: true })).rejects.toThrow("pasted HTML");
});

browserTest("responsive conversion captures two CSS states from one resolved source and shares Swift support", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-responsive-test-"));
  const seenUrls: string[] = [];
  try {
    const html = '<main data-markswift-root><span class="compact">Compact card</span><span class="regular">Regular card</span></main>';
    const result = await convertResponsive({ html, assetsDir: directory }, {
      name: "CardView", breakpoint: 350, ...sizes,
      css: 'html,body{margin:0}main{width:100vw;height:80px}.regular{display:none}@media(min-width:351px){.compact{display:none}.regular{display:block}}',
      async prepare(page) { seenUrls.push(page.url()); },
    });
    expect(seenUrls).toHaveLength(2);
    expect(seenUrls[0]).toBe(seenUrls[1]);
    expect(result.layouts.compact.size.w).toBe(320);
    expect(result.layouts.regular.size.w).toBe(390);
    expect(JSON.stringify(result.layouts.compact)).toContain("Compact card");
    expect(JSON.stringify(result.layouts.regular)).toContain("Regular card");
    expect(result.code).toContain("CardView");
    expect(result.views).toHaveLength(2);
    expect(result.files["CardView.swift"]).toBe(result.code);
    expect(Object.keys(result.files).filter((name) => name === "MarkswiftRuntime.swift")).toHaveLength(1);
    expect(result.warnings).toEqual([...new Set(result.warnings)]);
    expect(result.branchWarnings.compact.some((message) => message.includes("@media"))).toBe(true);
    expect(result.branchWarnings.regular.some((message) => message.includes("@media"))).toBe(true);
    expect(result.warnings.filter((message) => message.includes("@media"))).toEqual([
      "CSS @media sampled at compact 320px and regular 390px; generated Swift switches branches at width ≤ 350 points. " +
        "Intermediate widths and other media states are not reconstructed.",
    ]);
    expect(result.warnings.some((message) => message.includes("freezes this media-query state"))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);

browserTest("responsive conversion closes the browser and resolved local source after capture failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-responsive-cleanup-"));
  const handles: { browser?: Browser | null; origin?: string } = {};
  try {
    await expect(convertResponsive({ html: "<main data-markswift-root>Failure</main>", assetsDir: directory }, {
      name: "FailureView", breakpoint: 350, ...sizes,
      async prepare(page) {
        handles.origin = new URL(page.url()).origin;
        handles.browser = page.context().browser();
        throw new Error("intentional preparation failure");
      },
    })).rejects.toThrow("intentional preparation failure");
    expect(handles.browser?.isConnected()).toBe(false);
    await expect(fetch(handles.origin!)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

browserTest("responsive conversion rejects viewport changes made by the preparation hook", async () => {
  await expect(convertResponsive({ html: "<main data-markswift-root>Card</main>" }, {
    name: "CardView", breakpoint: 350, ...sizes,
    async prepare(page) { await page.setViewportSize({ width: 390, height: 568 }); },
  })).rejects.toThrow("compact capture viewport changed during prepare(); expected 320×568, received 390×568");
}, 30000);
