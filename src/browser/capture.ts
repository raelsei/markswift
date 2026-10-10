/**
 * Drives headless Chromium: loads a prepared page, settles fonts/animations,
 * then captures a DOMSnapshot and, on request, a device-scale screenshot
 * clipped to the capture root.
 * Knows nothing about where the page came from: the source's CaptureRequest
 * names the URL, root selector and theme; its NodeIdentity names the nodes.
 */
import { settle } from "./settle.ts";
import { collectFontFaces, readFontBytes } from "./fonts.ts";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { STYLE_WHITELIST, type LayoutDoc } from "../model/layout.ts";
import { snapshotToTree, findByAttr, toLayout, attachPreferredSizes, type DomSnapshot } from "./snapshot.ts";
import { readPreferredSizes } from "./sizing.ts";
import type { NodeIdentity, CaptureRequest } from "../input/types.ts";
import { inlineCapturedImages } from "./images.ts";

/** Stamped on the resolved `spec.root` element so the snapshot tree can be joined back to it. */
const ROOT_MARK = "data-markswift-root-capture";

export interface Capture {
  /** Resource failures and page errors observed while preparing this capture. */
  warnings: string[];
  layout: LayoutDoc;
  /** Set only when `CaptureRequest.screenshot` is true. */
  png?: Uint8Array;
  /**
   * Bytes of every `@font-face` source that was not already inline, named by content hash.
   * The caller writes them to `<outDir>/_fonts/<name>`, which is what
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
      if (r.ok() && mime?.startsWith("image/")) {
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
      // Static capture: transitions only interpolate towards the same end state, but a
      // running one makes computed values (and the transform:none probe) mid-flight.
      const noTransition = await page.addStyleTag({ content: "* { transition: none !important; }" });
      await noTransition.evaluate((s) => (s as Element).setAttribute("data-markswift-harness", ""));
      await settle(page);
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
      const snapArgs = { computedStyles: [...STYLE_WHITELIST], includePaintOrder: true, includeDOMRects: true };
      // A: as painted (computed transform matrices, paint order).
      const snapA = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      // B: transforms disabled → true layout boxes. Transforms never affect layout, and the
      // <style> is appended last so node indices of everything else are unchanged.
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.id = "__markswift_notransform";
        s.textContent = "* { transform: none !important; }";
        document.body.appendChild(s);
      });
      const snapB = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      await page.evaluate(() => document.getElementById("__markswift_notransform")?.remove());
      await cdp.detach();
      const tree = snapshotToTree(snapA, snapB);
      const rootRaw = findByAttr(tree, ROOT_MARK, "1");
      if (!rootRaw) throw new Error(`capture root ${spec.root} not in snapshot`);
      attachPreferredSizes(rootRaw, preferredSizes);
      delete rootRaw.attrs[ROOT_MARK];
      const root = toLayout(rootRaw, { x: rootRect.x, y: rootRect.y }, identity);
      if (!root) throw new Error(`capture root ${spec.root} has no layout`);
      let png: Uint8Array | undefined;
      if (spec.screenshot) {
        const { x, y, w, h } = rootRect;
        if (!(w > 0 && h > 0) || x + w <= 0 || y + h <= 0) throw new Error(`capture root ${spec.root} has an empty or off-page box (${w}×${h} at ${x},${y}); nothing to screenshot`);
        png = await page.screenshot({
          clip: { x, y, width: w, height: h },
          scale: "device",
          animations: "disabled",
          caret: "hide",
          type: "png",
        });
      }
      await Promise.all(imageReads);
      errors.push(...inlineCapturedImages(root, await page.evaluate(() => document.baseURI), images));
      return {
        warnings: errors,
        layout: {
          version: 2,
          source,
          combo: { screen: spec.screen, theme: spec.theme },
          size: { w: Math.round(rootRect.w), h: Math.round(rootRect.h) },
          dpr: this.opts.dpr,
          canvas: rootRect.canvas,
          fonts,
          root,
        },
        png,
        fontFiles,
      };
    } finally {
      await page.close();
    }
  }
}
