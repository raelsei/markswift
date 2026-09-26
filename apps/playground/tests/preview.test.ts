import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Frame, type Page } from "playwright-core";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

async function withPlayground(run: (page: Page) => Promise<void>): Promise<void> {
  const web = fileURLToPath(new URL("../web/", import.meta.url));
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ status: "ok" });
    const file = Bun.file(resolve(web, `.${path === "/" ? "/index.html" : path}`));
    return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
  } });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(server.url.toString());
    await page.waitForFunction(() => document.getElementById("service-label")?.textContent === "Converter ready");
    await run(page);
  } finally { await browser.close(); server.stop(true); }
}

async function previewFrame(page: Page): Promise<Frame> {
  const element = await page.locator("#html-preview").elementHandle();
  const frame = await element?.contentFrame();
  if (!frame) throw new Error("Missing preview frame.");
  return frame;
}

async function color(frame: Frame, id: string): Promise<string> {
  return frame.locator(`#${id}`).evaluate(element => getComputedStyle(element).color);
}

browserTest("preview viewport exactly matches requested dimensions on both sides of a CSS breakpoint", async () => {
  await withPlayground(async page => {
    await page.locator("#html-input").fill('<div id="width-probe">Width branch</div>');
    await page.locator("#css-tab").click();
    await page.locator("#css-input").fill("#width-probe{color:rgb(0,0,255)}@media(max-width:350px){#width-probe{color:rgb(255,0,0)}}");
    await page.locator("#viewport-width").fill("351");
    await page.locator("#viewport-height").fill("420");
    await page.locator("#preview-tab").click();
    const frame = await previewFrame(page);
    await frame.waitForFunction(() => {
      const probe = document.getElementById("width-probe");
      return !!probe && window.innerWidth === 351 && window.innerHeight === 420 && getComputedStyle(probe).color === "rgb(0, 0, 255)";
    });
    expect(await color(frame, "width-probe")).toBe("rgb(0, 0, 255)");
    await page.locator("#layout").selectOption("responsive");
    await page.locator("#preview-width").selectOption("compact");
    await frame.waitForFunction(() => window.innerWidth === 320 && window.innerHeight === 420);
    expect(await color(frame, "width-probe")).toBe("rgb(255, 0, 0)");
    await page.locator("#preview-width").selectOption("regular");
    await frame.waitForFunction(() => window.innerWidth === 351);
    expect(await color(frame, "width-probe")).toBe("rgb(0, 0, 255)");
  });
}, 20_000);

browserTest("preview selects offered system colors while retaining explicit schemes, important and variable declarations", async () => {
  await withPlayground(async page => {
    const html = `<!doctype html><html><head><meta name="color-scheme" content="light dark"><style>
      :root { color-scheme: light dark; }
      #canvas,#single,#priority,#inline { color: CanvasText; background: Canvas; }
      #field { color: FieldText; background: Field; }
      #single { color-scheme: light; }
      #priority { color-scheme: only light dark !important; }
      #priority { color-scheme: light; }
      #variables { --offered: light dark; color-scheme: var(--offered); }
    </style></head><body><div id="canvas">Canvas</div><input id="field" value="Field">
    <div id="single">Explicit light</div><div id="priority">Important choice</div>
    <div id="inline" style="color-scheme:only light dark!important">Inline choice</div><div id="variables">Variable declaration</div>
    </body></html>`;
    await page.locator("#html-input").fill(html);
    await page.locator("#css-tab").click();
    await page.locator("#css-input").fill("");
    await page.locator("#preview-tab").click();
    const frame = await previewFrame(page);
    const reference = await page.context().newPage();
    try {
      for (const theme of ["dark", "light"]) {
        await reference.emulateMedia({ colorScheme: theme as "light" | "dark" });
        await reference.setContent(html);
        const expected = await reference.locator("#canvas").evaluate(element => {
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        });
        await page.locator("#theme").selectOption(theme);
        await frame.waitForFunction(expected => {
          const element = document.getElementById("canvas");
          if (!element) return false;
          const style = getComputedStyle(element);
          return style.color === expected.color && style.backgroundColor === expected.background;
        }, expected);
        for (const id of ["canvas", "field", "single", "priority", "inline"]) {
          const colors = (element: Element) => {
            const style = getComputedStyle(element);
            return { color: style.color, background: style.backgroundColor };
          };
          expect(await frame.locator(`#${id}`).evaluate(colors)).toEqual(await reference.locator(`#${id}`).evaluate(colors));
        }
        expect(await frame.locator('meta[name="color-scheme"]').getAttribute("content")).toBe(theme);
        const declarations = await frame.evaluate(() => {
          const rules = [...document.styleSheets[0]!.cssRules] as CSSStyleRule[];
          const priority = rules.find(rule => rule.selectorText === "#priority" && rule.style.getPropertyPriority("color-scheme"));
          const variable = rules.find(rule => rule.selectorText === "#variables");
          return {
            priority: priority?.style.getPropertyPriority("color-scheme"), scheme: priority?.style.getPropertyValue("color-scheme"),
            variable: variable?.style.getPropertyValue("color-scheme"), custom: variable?.style.getPropertyValue("--offered"),
          };
        });
        expect(declarations.priority).toBe("important");
        expect(declarations.scheme).toContain("only");
        expect(declarations.scheme).toContain(theme);
        expect(declarations.variable).toBe("var(--offered)");
        expect(declarations.custom).toBe("light dark");
      }
      const metaOnly = html.replace(":root { color-scheme: light dark; }", "").replace("<body>", '<body data-scheme-source="meta-only">');
      await page.locator("#html-tab").click();
      await page.locator("#html-input").fill(metaOnly);
      await page.locator("#theme").selectOption("dark");
      await reference.emulateMedia({ colorScheme: "dark" });
      await reference.setContent(metaOnly);
      const metaColors = await reference.locator("#canvas").evaluate(element => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
      await frame.waitForFunction(expected => {
        const canvas = document.getElementById("canvas");
        return document.body.dataset.schemeSource === "meta-only" && !!canvas
          && getComputedStyle(canvas).color === expected.color && getComputedStyle(canvas).backgroundColor === expected.background;
      }, metaColors);
      expect(await frame.locator('meta[name="color-scheme"]').getAttribute("content")).toBe("dark");
      expect(await color(frame, "canvas")).toBe(metaColors.color);
    } finally { await reference.close(); }
  });
}, 20_000);

browserTest("preview emulates light dark light CSS conditions without changing literals, width queries or sandbox security", async () => {
  await withPlayground(async page => {
    const html = `<!doctype html><html><head><style>
      #inline { color: rgb(0,0,255); }
      @media (prefers-color-scheme/**/:/**/dark) { #inline { color: rgb(255,0,0); } }
      #literal::before { content: "@media (prefers-color-scheme: dark)"; }
      /* @media (prefers-color-scheme: light) must stay a comment. */
      @supports (display:grid) { @media (prefers-color-scheme: dark) { #nested { color: rgb(255,0,0); } } }
    </style><style media="(prefers-color-scheme: dark) and (min-width: 350px)">#attribute { color: rgb(255,0,0); }</style>
    <style media="all {} @media (prefers-color-scheme: dark)">#invalid { color: rgb(255,0,0); }</style></head>
    <body><div id="inline">Inline CSS</div><div id="attached">Attached CSS</div><div id="mixed">Mixed</div>
    <div id="negated">Negated</div><div id="nested">Nested</div><div id="attribute">Media attribute</div>
    <div id="narrow">Other widths</div><div id="invalid">Invalid media stays disabled</div><div id="literal"></div><button id="unsafe" onclick="document.body.dataset.executed='yes'">Unsafe action</button>
    <script>document.body.dataset.executed='yes';</script></body></html>`;
    const css = `:where(#attached,#mixed,#negated,#nested,#attribute,#narrow,#invalid) { color: rgb(0,0,255); }
      @media (prefers-color-scheme: dark) { #attached { color: rgb(255,0,0); } }
      @media (min-width:350px) and (prefers-color-scheme: dark) { #mixed { color: rgb(255,0,0); } }
      @media not (prefers-color-scheme: light) { #negated { color: rgb(255,0,0); } }
      @media (max-width:300px) and (prefers-color-scheme: dark) { #narrow { color: rgb(255,0,0); } }`;
    await page.locator("#html-input").fill(html);
    await page.locator("#css-tab").click();
    await page.locator("#css-input").fill(css);
    await page.locator("#viewport-width").fill("351");
    await page.locator("#preview-tab").click();
    const frame = await previewFrame(page);
    const ids = ["inline", "attached", "mixed", "negated", "nested", "attribute"];
    for (const theme of ["light", "dark", "light"]) {
      await page.locator("#theme").selectOption(theme);
      const expected = theme === "dark" ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)";
      await frame.waitForFunction(({ ids, expected }) => window.innerWidth === 351 && ids.every(id => {
        const node = document.getElementById(id);
        return !!node && getComputedStyle(node).color === expected;
      }), { ids, expected });
      for (const id of ids) expect(await color(frame, id)).toBe(expected);
      expect(await color(frame, "narrow")).toBe("rgb(0, 0, 255)");
      expect(await color(frame, "invalid")).toBe("rgb(0, 0, 255)");
      expect(await frame.locator("#literal").evaluate(element => getComputedStyle(element, "::before").content)).toBe('"@media (prefers-color-scheme: dark)"');
      await frame.locator("#unsafe").click();
      expect(await frame.locator("body").getAttribute("data-executed")).toBeNull();
      expect(await page.locator("#html-preview").getAttribute("sandbox")).toBe("");
      expect(await frame.evaluate(() => document.querySelectorAll("script").length)).toBe(0);
    }
    expect(await page.locator("#html-input").inputValue()).toBe(html);
    expect(await page.locator("#css-input").inputValue()).toBe(css);
  });
}, 20_000);
