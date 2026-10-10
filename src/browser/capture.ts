/**
 * Drives headless Chromium: loads a prepared page, settles fonts/animations,
 * then captures a DOMSnapshot and, on request, a device-scale screenshot
 * clipped to the capture root.
 * Knows nothing about where the page came from: the source's CaptureRequest
 * names the URL, root selector and theme; its NodeIdentity names the nodes.
 */
import { settle } from "./settle.ts";
import { collectFontFaces, readFontBytes } from "./fonts.ts";
import { chromium, type Browser, type BrowserContext, type Response } from "playwright-core";
import { STYLE_WHITELIST, type LayoutDoc } from "../model/layout.ts";
import { snapshotToTree, findByAttr, toLayout, attachPreferredSizes, type DomSnapshot } from "./snapshot.ts";
import { readPreferredSizes } from "./sizing.ts";
import type { NodeIdentity, CaptureRequest } from "../input/types.ts";
import { inlineCapturedImages } from "./images.ts";

/** Stamped on the resolved `spec.root` element so the snapshot tree can be joined back to it. */
const ROOT_MARK = "data-markswift-root-capture";
/** Stamped (after snapshot A) on every element whose `transform`/`translate`/`rotate`/`scale` is not `none`. */
const TRANSFORMED_MARK = "data-markswift-transformed";
/** Every property that moves paint without moving layout. */
const NO_TRANSFORM = "transform: none !important; translate: none !important; rotate: none !important; scale: none !important;";

/** The final URL of a response and every URL it was redirected from. */
const requestURLs = (r: Response) => {
  const urls = [r.url()];
  for (let q = r.request().redirectedFrom(); q; q = q.redirectedFrom()) urls.push(q.url());
  return urls;
};

const UNCOMPILED_TAILWIND = /@tailwind\s+(base|components|utilities|variants)\b|@import\s+(url\(\s*)?["']tailwindcss["']|@apply\s/;

/** Raster type of an image response served without an `image/*` content type, from its magic bytes. */
function sniffImage(b: Buffer): string | undefined {
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

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
  private stopping?: Promise<void>;

  constructor(private readonly opts: { dpr: number; viewport: { width: number; height: number }; channel?: string; restricted?: boolean; signal?: AbortSignal }) {}

  async start(): Promise<void> {
    // Restricted: no hostname (nor IP literal) resolves, so DNS prefetch, preconnect and anything
    // that slips past `page.route` cannot reach the network. The document itself is fulfilled by the route.
    const args = this.opts.restricted ? ["--host-resolver-rules=MAP * ~NOTFOUND"] : [];
    this.browser = await chromium.launch({ headless: true, channel: this.opts.channel ?? "chrome", args });
    this.context = await this.browser.newContext({
      viewport: this.opts.viewport,
      deviceScaleFactor: this.opts.dpr,
      reducedMotion: "reduce",
    });
  }

  /** Version of the launched browser (e.g. `153.0.8010.12`). */
  get version(): string { return this.browser.version(); }

  /**
   * Safe to call more than once and concurrently (the conversion deadline and its cleanup both
   * call it): one close runs. Before `start` has a browser it does nothing, so a later call still closes it.
   */
  stop(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.stopping ??= (async () => {
      try { await this.context?.close(); }
      finally { await this.browser.close(); }
    })();
    return this.stopping;
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
    const sheets = new Map<string, string>();
    const sheetReads: Promise<void>[] = [];
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
      if (r.ok() && (mime?.startsWith("image/") || r.request().resourceType() === "image")) {
        imageReads.push(r.body().then((bytes) => {
          const type = mime?.startsWith("image/") ? mime : sniffImage(bytes);
          if (!type) { errors.push(`Image response is not an image: ${r.url()}`); return; }
          for (const u of requestURLs(r)) images.set(u, `data:${type};base64,${bytes.toString("base64")}`);
        }).catch(() => { errors.push(`Could not capture image bytes: ${r.url()}`); }));
      }
      if (r.ok() && r.request().resourceType() === "stylesheet") {
        sheetReads.push(r.text().then((text) => { for (const u of requestURLs(r)) sheets.set(u, text); })
          .catch(() => { errors.push(`Could not read stylesheet: ${r.url()}`); }));
      }
    });
    try {
      await page.emulateMedia({ colorScheme: spec.theme });
      // Public pasted markup is captured as a document, but cannot reach the host's network.
      // The exact document route below is registered last and fulfills that one request.
      // `aborted` (net::ERR_ABORTED) cancels a navigation (meta refresh, link) without committing
      // Chrome's error page, so the pasted document stays the one captured.
      if (this.opts.restricted) await page.route("**/*", route => route.abort("aborted"));
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
      await Promise.all(sheetReads);
      const { faces: fonts, unreadable } = await collectFontFaces(page, Object.fromEntries(sheets));
      for (const href of unreadable) errors.push(`Stylesheet could not be read: ${href}; its @font-face rules were not collected.`);
      const inlineStyles = await page.evaluate(() => [...document.querySelectorAll("style:not([data-markswift-harness])")].map((s) => s.textContent ?? ""));
      const tailwind = new Set<string>();
      for (const text of inlineStyles) if (UNCOMPILED_TAILWIND.test(text)) tailwind.add("inline <style>");
      for (const [url, text] of sheets) if (UNCOMPILED_TAILWIND.test(text)) tailwind.add(url);
      for (const label of tailwind) errors.push(`Stylesheet ${label} contains uncompiled Tailwind directives (@tailwind / @import "tailwindcss" / @apply); compile it first (for example with the Tailwind CLI) — the capture saw unstyled markup.`);
      const fontFiles = await readFontBytes(fonts, !this.opts.restricted, this.opts.signal);
      const canvas = await page.evaluate(
        ({ sel, mark }) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`capture root ${sel} not found`);
          el.setAttribute(mark, "1");
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
          return canvas;
        },
        { sel: spec.root, mark: ROOT_MARK },
      );
      const cdp = await this.context.newCDPSession(page);
      const preferredSizes = await readPreferredSizes(page, spec.root);
      const snapArgs = { computedStyles: [...STYLE_WHITELIST], includePaintOrder: true, includeDOMRects: true };
      // A: as painted (computed transform matrices, paint order).
      const snapA = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      // Marked after A so the attribute never reaches the captured `attrs` (B's attributes are not read).
      await page.evaluate((mark) => {
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.transform !== "none" || cs.translate !== "none" || cs.rotate !== "none" || cs.scale !== "none") el.setAttribute(mark, "");
        }
      }, TRANSFORMED_MARK);
      // B: transforms disabled → true layout boxes. Transforms never affect layout, and the
      // <style> is appended last so node indices of everything else are unchanged. The individual
      // transform properties (Tailwind v4's rotate-*/scale-*/translate-*) are cancelled too.
      // `will-change: transform` keeps the containing block a transform gave to fixed/absolute
      // descendants, without transforming anything.
      await page.evaluate((css) => {
        const s = document.createElement("style");
        s.id = "__markswift_notransform";
        s.textContent = css;
        document.body.appendChild(s);
      }, `* { ${NO_TRANSFORM} }\n[${TRANSFORMED_MARK}] { will-change: transform !important; }`);
      const snapB = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      await page.evaluate(() => document.getElementById("__markswift_notransform")?.remove());
      await cdp.detach();
      const tree = snapshotToTree(snapA, snapB);
      const rootRaw = findByAttr(tree, ROOT_MARK, "1");
      if (!rootRaw) throw new Error(`capture root ${spec.root} not in snapshot`);
      attachPreferredSizes(rootRaw, preferredSizes);
      delete rootRaw.attrs[ROOT_MARK];
      // Origin, size and screenshot come from the root's untransformed (snapshot B) box, the same
      // space as every child's bounds; `rootRect` would include an ancestor's transform.
      const box = rootRaw.bounds;
      const root = box && toLayout(rootRaw, { x: box.x, y: box.y }, identity);
      if (!box || !root) throw new Error(`capture root ${spec.root} has no layout`);
      let png: Uint8Array | undefined;
      if (spec.screenshot) {
        const { x, y, w, h } = box;
        if (!(w > 0 && h > 0) || x + w <= 0 || y + h <= 0) throw new Error(`capture root ${spec.root} has an empty or off-page box (${w}×${h} at ${x},${y}); nothing to screenshot`);
        // The reference shows the component at its layout box: ancestors' transforms are cancelled
        // (keeping their containing blocks), the root's own transform stays painted.
        await page.evaluate((css) => {
          const s = document.createElement("style");
          s.textContent = css;
          document.body.appendChild(s);
        }, `:has([${ROOT_MARK}]) { ${NO_TRANSFORM} }\n[${TRANSFORMED_MARK}]:has([${ROOT_MARK}]) { will-change: transform !important; }`);
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
          size: { w: Math.round(box.w), h: Math.round(box.h) },
          // `|| 0`: a root at the page origin gives -0, which JSON and deep equality treat differently.
          viewport: { x: -box.x || 0, y: -box.y || 0, w: this.opts.viewport.width, h: this.opts.viewport.height },
          dpr: this.opts.dpr,
          canvas,
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
