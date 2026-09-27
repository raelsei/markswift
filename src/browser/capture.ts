import { settle } from "./settle.ts";
import { collectFontFaces, readFontBytes } from "./fonts.ts";
/**
 * Drives headless Chromium: loads a prepared page, settles fonts/animations,
 * hides chrome that is not part of the captured screen, then captures a
 * DOMSnapshot and a device-scale screenshot clipped to the capture root.
 * Knows nothing about where the page came from: the source's CaptureRequest
 * names the URL, root selector and theme; its NodeIdentity names the nodes.
 */
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { STYLE_WHITELIST, type LayoutDoc } from "../model/layout.ts";
import { snapshotToTree, findByAttr, toLayout, attachPreferredSizes, type DomSnapshot } from "./snapshot.ts";
import { readPreferredSizes } from "./sizing.ts";
import { readFormSnapshot, attachFormSnapshot } from "./form-snapshot.ts";
import type { NodeIdentity, CaptureRequest } from "../input/types.ts";
import { inlineCapturedImages } from "./images.ts";
import { generatedContentWarnings } from "./generated-content.ts";
import { readKeyframeNames, readTransitionProperties, restoreTransitionProperties } from "./motion.ts";
import { mediaWarning, readMediaConditions } from "./media.ts";
import { readTextMetrics, attachTextMetrics } from "./text-metrics.ts";
import { readMarkerLayouts, attachMarkerLayouts } from "./list-markers.ts";

/** Stamped on the resolved `spec.root` element so the snapshot tree can be joined back to it. */
const ROOT_MARK = "data-h2s-root-capture";

export interface Capture {
  /** Resource failures and page errors observed while preparing this capture. */
  warnings: string[];
  layout: LayoutDoc;
  png: Buffer;
  /** outerHTML of the captured root with all template values resolved. */
  domHtml: string;
  /** Every <style> on the page (theme variables, keyframes). */
  themeCss: string;
  /**
   * Bytes of every `@font-face` source that was not already inline, named by content hash.
   * Written by `captureInput` to `<outDir>/_fonts/<name>`, which is what
   * `LayoutDoc.fonts[].src[].file` points at; identical faces across screens or inputs collapse
   * onto one file.
   */
  fontFiles: Array<{ name: string; bytes: Uint8Array }>;
}

export class BrowserCapture {
  private browser!: Browser;
  private context!: BrowserContext;

  constructor(private readonly opts: { dpr: number; viewport: { width: number; height: number }; channel?: string; restricted?: boolean }) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true, channel: this.opts.channel ?? "chrome" });
    this.context = await this.browser.newContext({
      viewport: this.opts.viewport,
      deviceScaleFactor: this.opts.dpr,
      reducedMotion: "reduce",
    });
  }

  async stop(): Promise<void> {
    try { await this.context?.close(); }
    finally { await this.browser?.close(); }
  }

  /**
   * Capture one screen. `identity` names layout nodes; `source` is the
   * LayoutDoc.source label. The page's `prefers-color-scheme` follows `spec.theme`.
   */
  async capture(spec: CaptureRequest, identity: NodeIdentity, source: string): Promise<Capture> {
    const page = await this.context.newPage();
    const errors: string[] = [];
    const styleWarnings: string[] = [];
    const images = new Map<string, string>();
    const imageReads: Promise<void>[] = [];
    // Chromium probes /favicon.ico on its own; a static directory rarely has one.
    const favicon = (url: string) => url.endsWith("/favicon.ico");
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !favicon(m.location().url)) errors.push(m.text());
    });
    page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && !favicon(r.url())) errors.push(`${r.status()} ${r.url()}`);
      const mime = r.headers()["content-type"]?.split(";")[0];
      if (spec.inlineImages && r.ok() && mime?.startsWith("image/")) {
        imageReads.push(r.body().then((bytes) => { images.set(r.url(), `data:${mime};base64,${bytes.toString("base64")}`); })
          .catch(() => { errors.push(`Could not capture image bytes: ${r.url()}`); }));
      }
    });
    try {
      await page.emulateMedia({ colorScheme: spec.theme });
      // Public pasted markup is captured as a document, but cannot reach the host's network.
      // The exact document route below is registered last and fulfills that one request.
      if (this.opts.restricted) await page.route("**/*", route => route.abort());
      if (spec.html !== undefined) {
        const documentURL = new URL(spec.url); documentURL.hash = "";
        await page.route((url) => url.href === documentURL.href, (route) => route.request().isNavigationRequest()
          ? route.fulfill({ contentType: "text/html; charset=utf-8", body: spec.html!,
            ...(this.opts.restricted ? { headers: { "Content-Security-Policy": "default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'" } } : {}) })
          : this.opts.restricted ? route.abort() : route.continue());
      }
      await page.goto(spec.url, { waitUntil: "load" });
      await page.waitForSelector(spec.waitFor ?? spec.root, { state: "attached", timeout: 15_000 });
      await spec.prepare?.(page);
      // Keep authored motion facts while preventing mid-transition geometry in the snapshot.
      const transitionProperties = await readTransitionProperties(page, spec.root);
      // Static capture: transitions only interpolate towards the same end state, but a
      // running one makes computed values (and the transform:none probe) mid-flight.
      const noTransition = await page.addStyleTag({ content: "*, *::before, *::after, *::marker { transition-property: none !important; }" });
      await noTransition.evaluate((s) => (s as Element).setAttribute("data-h2s-harness", ""));
      await settle(page, spec.hide ?? []);
      for (const name of await readKeyframeNames(page)) styleWarnings.push(`CSS @keyframes ${name} declaration is not translated; generated Swift captures only the static state`);
      const media = mediaWarning(await readMediaConditions(page));
      if (media) styleWarnings.push(media);
      const fonts = await collectFontFaces(page);
      const fontFiles = await readFontBytes(fonts, !this.opts.restricted);
      const rootRect = await page.evaluate(
        ({ sel, mark }) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`capture root ${sel} not found`);
          el.setAttribute(mark, "1");
          const r = el.getBoundingClientRect();
          // Effective backdrop behind the captured root: nearest ancestor with an opaque-ish
          // background. Chromium serialises modern colour functions verbatim (`oklch(…)`,
          // `color(display-p3 …)`), so opacity comes from the legacy 4th component or from the
          // `/ <alpha>` slash form; any other serialisation is opaque.
          let canvas = "rgb(255, 255, 255)";
          for (let p: Element | null = el; p; p = p.parentElement) {
            const bg = getComputedStyle(p).backgroundColor;
            if (!bg || bg === "transparent" || bg === "none") continue;
            const legacy = /^rgba?\(([^)]+)\)$/.exec(bg);
            const slash = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(bg);
            const alpha = legacy ? parseFloat((legacy[1]!.split(",")[3] ?? "1").trim()) : slash ? parseFloat(slash[1]!) / (slash[2] ? 100 : 1) : 1;
            if (alpha > 0.5) {
              canvas = bg;
              break;
            }
          }
          return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height, canvas };
        },
        { sel: spec.root, mark: ROOT_MARK },
      );
      const cdp = await this.context.newCDPSession(page);
      const preferredSizes = await readPreferredSizes(page, spec.root);
      const textMetrics = await readTextMetrics(page, spec.root);
      const markerLayouts = await readMarkerLayouts(page, spec.root, cdp);
      const snapArgs = { computedStyles: [...STYLE_WHITELIST], includePaintOrder: true, includeDOMRects: true };
      const formSnapshot = await readFormSnapshot(page);
      // A: as painted (computed transform matrices, paint order).
      const snapA = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      // B: transforms disabled → true layout boxes. Transforms never affect layout, and the
      // <style> is appended last so node indices of everything else are unchanged.
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.id = "__h2s_notransform";
        s.textContent = "* { transform: none !important; }";
        document.body.appendChild(s);
      });
      const snapB = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      await page.evaluate(() => document.getElementById("__h2s_notransform")?.remove());
      await cdp.detach();
      const tree = snapshotToTree(snapA, snapB);
      attachFormSnapshot(tree, formSnapshot);
      const rootRaw = findByAttr(tree, ROOT_MARK, "1");
      if (!rootRaw) throw new Error(`capture root ${spec.root} not in snapshot`);
      restoreTransitionProperties(rootRaw, transitionProperties);
      errors.push(...generatedContentWarnings(rootRaw));
      attachPreferredSizes(rootRaw, preferredSizes);
      attachTextMetrics(rootRaw, textMetrics);
      attachMarkerLayouts(rootRaw, markerLayouts);
      delete rootRaw.attrs[ROOT_MARK];
      const root = toLayout(rootRaw, { x: rootRect.x, y: rootRect.y }, identity);
      if (!root) throw new Error(`capture root ${spec.root} has no layout`);
      // Resolved DOM of the captured root (for LLM baselines and debugging).
      const domHtml = await page.evaluate(
        ({ sel, mark }) => {
          const el = document.querySelector(sel)!;
          el.removeAttribute(mark);
          return el.outerHTML;
        },
        { sel: spec.root, mark: ROOT_MARK },
      );
      // The page's own <style>s only; harness-injected rules are not part of the design.
      const themeCss = await page.evaluate(() =>
        [...document.querySelectorAll("style:not([data-h2s-harness])")].map((s) => s.textContent ?? "").join("\n"),
      );
      const png = await page.screenshot({
        clip: { x: rootRect.x, y: rootRect.y, width: rootRect.w, height: rootRect.h },
        scale: "device",
        animations: "disabled",
        caret: "hide",
        type: "png",
      });
      if (spec.inlineImages) {
        await Promise.all(imageReads);
        errors.push(...inlineCapturedImages(root, await page.evaluate(() => document.baseURI), images));
      }
      if (errors.length && !spec.inlineImages) console.warn(`[render] ${spec.screen}/${spec.theme}: page errors:\n  ${errors.join("\n  ")}`);
      return {
        warnings: [...errors, ...styleWarnings],
        layout: {
          version: 1,
          source,
          combo: { screen: spec.screen, theme: spec.theme, demoState: spec.demoState ?? "normal" },
          size: { w: Math.round(rootRect.w), h: Math.round(rootRect.h) },
          dpr: this.opts.dpr,
          canvas: rootRect.canvas,
          // Always present, empty included: "this page declared no @font-face" and "nobody
          // looked" are different facts, and only a capture that looked may claim the first.
          fonts,
          root,
        },
        png,
        domHtml,
        themeCss,
        fontFiles,
      };
    } finally {
      await page.close();
    }
  }
}
