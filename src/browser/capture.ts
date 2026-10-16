/**
 * Drives headless Chromium: loads a prepared page, settles fonts/animations,
 * then captures a DOMSnapshot and, on request, a device-scale screenshot
 * clipped to the capture root.
 * Knows nothing about where the page came from: the source's CaptureRequest
 * names the URL, root selector and theme; its NodeIdentity names the nodes.
 */
import { settle } from "./settle.ts";
import { collectFontFaces, readFontBytes } from "./fonts.ts";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright-core";
import { LAYOUT_DOC_VERSION, STYLE_WHITELIST, type Layer, type LayoutDoc } from "../model/layout.ts";
import {
  snapshotToTree,
  findByAttr,
  toLayout,
  attachPreferredSizes,
  attachMotion,
  rawAt,
  type DomSnapshot,
} from "./snapshot.ts";
import { readPreferredSizes } from "./sizing.ts";
import { readElementAnimations, readMotion, recordAnimations } from "./motion.ts";
import { applyConditionMarks, readConditionalRules } from "./conditions.ts";
import type { NodeIdentity, CaptureRequest, Trigger } from "../input/types.ts";
import type { ConversionWarning } from "../model/semantic.ts";
import { inlineCapturedImages } from "./images.ts";
import { captureStates } from "./states.ts";
import {
  LAYER_MARK,
  activate,
  assembleLayer,
  dismissCandidates,
  findTriggers,
  openLayer,
  probeDismiss,
  rootHidden,
  triggerPaint,
  type DismissCandidate,
} from "./layers.ts";

/** Stamped on the resolved `spec.root` element so the snapshot tree can be joined back to it. */
const ROOT_MARK = "data-markswift-root-capture";
/** Stamped (after snapshot A) on every element whose `transform`/`translate`/`rotate`/`scale` is not `none`. */
const TRANSFORMED_MARK = "data-markswift-transformed";
/** Stamped (after snapshot A) on every `position: relative` element: snapshot B and the screenshot drop its offset. */
const RELATIVE_MARK = "data-markswift-relative";
/** Every property that moves paint without moving layout. */
const NO_TRANSFORM =
  "transform: none !important; translate: none !important; rotate: none !important; scale: none !important;";

/** The final URL of a response and every URL it was redirected from. */
const requestURLs = (r: Response) => {
  const urls = [r.url()];
  for (let q = r.request().redirectedFrom(); q; q = q.redirectedFrom()) urls.push(q.url());
  return urls;
};

const UNCOMPILED_TAILWIND =
  /@tailwind\s+(base|components|utilities|variants)\b|@import\s+(url\(\s*)?["']tailwindcss["']|@apply\s/;

/** Raster type of an image response served without an `image/*` content type, from its magic bytes. */
function sniffImage(b: Buffer): string | undefined {
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

/** Marks every transformed element and every `position: relative` one (`TRANSFORMED_MARK`, `RELATIVE_MARK`). */
async function markTransformed(page: Page): Promise<void> {
  await page.evaluate(
    ([transformed, relative]) => {
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.transform !== "none" || cs.translate !== "none" || cs.rotate !== "none" || cs.scale !== "none")
          el.setAttribute(transformed, "");
        if (cs.position === "relative") el.setAttribute(relative, "");
      }
    },
    [TRANSFORMED_MARK, RELATIVE_MARK] as const,
  );
}

/** The reference shows the component at its layout box: ancestors' transforms and relative offsets are cancelled
 * (keeping their containing blocks), the root's own transform stays painted. Needs `ROOT_MARK` and `markTransformed`. */
async function cancelAncestorTransforms(page: Page): Promise<void> {
  await page.evaluate((css) => {
    const s = document.createElement("style");
    s.textContent = css;
    document.body.appendChild(s);
  }, `:has([${ROOT_MARK}]) { ${NO_TRANSFORM} }\n[${TRANSFORMED_MARK}]:has([${ROOT_MARK}]) { will-change: transform !important; }\n[${RELATIVE_MARK}]:has([${ROOT_MARK}]) { inset: auto !important; }`);
}

/** `transition: none` for static captures, tagged so the captured `<style>` list skips it. */
async function noTransitions(page: Page) {
  const sheet = await page.addStyleTag({ content: "* { transition: none !important; }" });
  await sheet.evaluate((s) => (s as Element).setAttribute("data-markswift-harness", ""));
  return sheet;
}

export interface Capture {
  /** Resource failures, page errors and viewport-dependent CSS observed while preparing this capture. */
  warnings: ConversionWarning[];
  layout: LayoutDoc;
  /** Set only when `CaptureRequest.screenshot` is true. */
  png?: Uint8Array;
  /**
   * Bytes of every `@font-face` source that was not already inline, keyed by `file`: exactly
   * the `LayoutDoc.fonts[].src[].file` value (`_fonts/<content hash>.<ext>`) that points at
   * them. Packaging reads them from here; the conversion never writes them to disk. Identical
   * faces collapse onto one entry.
   */
  fontFiles: Array<{ file: string; bytes: Uint8Array }>;
  /** Rest captures: what the open-state pass activates (`browser/layers.ts`), in document order. */
  triggers?: Trigger[];
  /** `spec.open` captures whose trigger opened something: the layer, the open root size, and the trigger-subtree
   * paint while open (LayoutNode id → delta). */
  opened?: { layer: Layer; size: { w: number; h: number }; openPaint: Record<string, Record<string, string>> };
}

export interface CaptureOptions {
  dpr: number;
  viewport: { width: number; height: number };
  channel?: string;
  restricted?: boolean;
  signal?: AbortSignal;
}

export class BrowserCapture {
  private browser!: Browser;
  private context!: BrowserContext;
  private stopping?: Promise<void>;
  private readonly opts: CaptureOptions;

  constructor(opts: CaptureOptions) {
    this.opts = opts;
  }

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
  get version(): string {
    return this.browser.version();
  }

  /**
   * Safe to call more than once and concurrently (the conversion deadline and its cleanup both
   * call it): one close runs. Before `start` has a browser it does nothing, so a later call still closes it.
   */
  stop(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.stopping ??= (async () => {
      try {
        await this.context?.close();
      } finally {
        await this.browser.close();
      }
    })();
    return this.stopping;
  }

  /**
   * Capture one screen. `identity` names layout nodes; `source` is the
   * LayoutDoc.source label. The page's `prefers-color-scheme` follows `spec.theme`.
   */
  async capture(spec: CaptureRequest, identity: NodeIdentity, source: string): Promise<Capture> {
    const page = await this.context.newPage();
    const viewport = spec.viewport ?? this.opts.viewport;
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
        imageReads.push(
          r
            .body()
            .then((bytes) => {
              const type = mime?.startsWith("image/") ? mime : sniffImage(bytes);
              if (!type) {
                errors.push(`Image response is not an image: ${r.url()}`);
                return;
              }
              for (const u of requestURLs(r)) images.set(u, `data:${type};base64,${bytes.toString("base64")}`);
            })
            .catch(() => {
              errors.push(`Could not capture image bytes: ${r.url()}`);
            }),
        );
      }
      if (r.ok() && r.request().resourceType() === "stylesheet") {
        sheetReads.push(
          r
            .text()
            .then((text) => {
              for (const u of requestURLs(r)) sheets.set(u, text);
            })
            .catch(() => {
              errors.push(`Could not read stylesheet: ${r.url()}`);
            }),
        );
      }
    });
    try {
      await this.load(page, spec);
      // Static capture: transitions only interpolate towards the same end state, but a
      // running one makes computed values (and the transform:none probe) mid-flight.
      const noTransition = await noTransitions(page);
      // Motion is read before settle() finishes it (a finished CSSAnimation leaves getAnimations()).
      const motion = await readMotion(page, spec.root);
      errors.push(...motion.warnings);
      await settle(page);
      const cdp = await this.context.newCDPSession(page);
      await Promise.all(sheetReads);
      const { faces: fonts, unreadable } = await collectFontFaces(page, Object.fromEntries(sheets));
      for (const href of unreadable)
        errors.push(`Stylesheet could not be read: ${href}; its @font-face rules were not collected.`);
      const inlineStyles = await page.evaluate(() =>
        [...document.querySelectorAll("style:not([data-markswift-harness])")].map((s) => s.textContent ?? ""),
      );
      const tailwind = new Set<string>();
      for (const text of inlineStyles) if (UNCOMPILED_TAILWIND.test(text)) tailwind.add("inline <style>");
      for (const [url, text] of sheets) if (UNCOMPILED_TAILWIND.test(text)) tailwind.add(url);
      for (const label of tailwind)
        errors.push(
          `Stylesheet ${label} contains uncompiled Tailwind directives (@tailwind / @import "tailwindcss" / @apply); compile it first (for example with the Tailwind CLI) — the capture saw unstyled markup.`,
        );
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
            const alpha = legacy
              ? parseFloat((legacy[1]!.split(",")[3] ?? "1").trim())
              : slash
                ? parseFloat(slash[1]!) / (slash[2] ? 100 : 1)
                : 1;
            if (alpha > 0.5) {
              canvas = bg;
              break;
            }
          }
          return canvas;
        },
        { sel: spec.root, mark: ROOT_MARK },
      );
      const rootSel = `[${ROOT_MARK}="1"]`;
      const found = spec.open ? undefined : await findTriggers(page, rootSel);
      errors.push(...(found?.warnings ?? []));
      // Open path (`spec.open`): activate the trigger, mark the roots of what gained layout.
      const opening = spec.open && (await openLayer(page, cdp, rootSel, ROOT_MARK, spec.open));
      if (spec.open && !opening) errors.push(`trigger ${spec.open.id} is not in its open-state page; nothing opened`);
      const roots = await Promise.all(
        (opening ? opening.roots : []).map(async (_, i) => (await page.$(`[${LAYER_MARK}="${i}"]`))!),
      );
      // 066: enter read — roots[i] ↔ layer.nodes[i], before settle (`activate` recorded what the opening started)
      const enter = roots.length ? await readElementAnimations(page, roots) : { lists: [], warnings: [] };
      errors.push(...enter.warnings);
      let animated = enter.lists.some((l) => l.length);
      if (opening) {
        // Drops the :focus-visible ring the content took when it opened.
        await settle(page);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await settle(page);
      }
      const rootInfo = roots.length
        ? await page.evaluate(
            (mark) =>
              [...document.querySelectorAll(`[${mark}]`)]
                .sort((a, b) => Number(a.getAttribute(mark)) - Number(b.getAttribute(mark)))
                .map((el) => {
                  const cs = getComputedStyle(el);
                  return {
                    modal: el.matches(":modal"),
                    anchored:
                      cs.getPropertyValue("position-area") !== "none" ||
                      cs.getPropertyValue("position-anchor") !== "normal",
                  };
                }),
            LAYER_MARK,
          )
        : [];
      const hiddenOnOpen = !!opening && roots.length > 0 && !opening.hidden && (await rootHidden(page, rootSel));
      const conditional = await readConditionalRules(page, spec.root, viewport.width, spec.breakpoints);
      const { sizes, pseudoStyles } = await readPreferredSizes(page, spec.root);
      const layerSizes = await Promise.all(roots.map((_, i) => readPreferredSizes(page, `[${LAYER_MARK}="${i}"]`)));
      const snapArgs = { computedStyles: [...STYLE_WHITELIST], includePaintOrder: true, includeDOMRects: true };
      // A: as painted (computed transform matrices, paint order).
      const snapA = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      // Pressed/focused looks: paint-only snapshots of the same load and viewport (no script runs), plus the
      // CSSTransitions each state starts (rest page only: transitions are keyed by paths under `spec.root`).
      // In an open page, the layer's own buttons and fields.
      const states = await captureStates(
        cdp,
        spec.open ? `[${LAYER_MARK}]` : rootSel,
        snapA,
        spec.open ? undefined : { page, sheet: noTransition, root: spec.root, authorReduce: motion.authorReduce },
      );
      errors.push(...states.warnings);
      // Marked after A so the attribute never reaches the captured `attrs` (B's attributes are not read).
      await markTransformed(page);
      // B: transforms disabled → true layout boxes. Transforms never affect layout, and the
      // <style> is appended last so node indices of everything else are unchanged. The individual
      // transform properties (Tailwind v4's rotate-*/scale-*/translate-*) are cancelled too.
      // `will-change: transform` keeps the containing block a transform gave to fixed/absolute
      // descendants, without transforming anything. Relative offsets move paint without moving layout too: B lays
      // those boxes out in flow (analysis re-applies the offset from their Typed-OM insets).
      await page.evaluate((css) => {
        const s = document.createElement("style");
        s.id = "__markswift_notransform";
        s.textContent = css;
        document.body.appendChild(s);
      }, `* { ${NO_TRANSFORM} }\n[${TRANSFORMED_MARK}] { will-change: transform !important; }\n[${RELATIVE_MARK}] { inset: auto !important; }`);
      const snapB = (await cdp.send("DOMSnapshot.captureSnapshot", snapArgs)) as unknown as DomSnapshot;
      await page.evaluate(() => document.getElementById("__markswift_notransform")?.remove());
      // (the CDP session stays open for the dismiss probes)
      const tree = snapshotToTree(snapA, snapB, states);
      const rootRaw = findByAttr(tree, ROOT_MARK, "1");
      if (!rootRaw) throw new Error(`capture root ${spec.root} not in snapshot`);
      attachPreferredSizes(rootRaw, sizes, pseudoStyles);
      for (const [path, transitions] of Object.entries(states.transitions))
        motion.motion[path] = { ...motion.motion[path], transitions };
      attachMotion(rootRaw, motion.motion);
      delete rootRaw.attrs[ROOT_MARK];
      // Origin, size and screenshot come from the root's untransformed (snapshot B) box, the same
      // space as every child's bounds; `rootRect` would include an ancestor's transform.
      const box = rootRaw.bounds;
      const root = box && toLayout(rootRaw, { x: box.x, y: box.y }, identity);
      if (!box || !root) throw new Error(`capture root ${spec.root} has no layout`);
      const conditions = applyConditionMarks(root, conditional.found);
      // One integer size for the screenshot clip and the native frame: Chrome floors a fractional clip.
      const size = { w: Math.floor(box.w), h: Math.floor(box.h) };
      const triggers = found?.triggers.map((t) => {
        const raw = rawAt(rootRaw, t.path)!;
        return { ...t, trigger: identity(raw.name, raw.attrs, t.path) ?? t.path };
      });
      let opened: Capture["opened"];
      let candidates: DismissCandidate[] = [];
      if (spec.open && opening && roots.length) {
        const marked = roots.map((_, i) => findByAttr(tree, LAYER_MARK, String(i))!);
        marked.forEach((raw, i) => {
          delete raw.attrs[LAYER_MARK];
          attachPreferredSizes(raw, layerSizes[i]!.sizes, layerSizes[i]!.pseudoStyles);
        });
        const { layer, paths } = assembleLayer({
          trigger: spec.open,
          rootRaw,
          root,
          marked,
          origin: { x: box.x, y: box.y },
          identity,
          info: rootInfo,
          hiddenOnOpen,
        });
        // 066: enter attach — after layer assembly
        enter.lists.forEach((list, i) => {
          if (list.length) layer.nodes[i]!.motion = { ...layer.nodes[i]!.motion, enter: list };
        });
        const { paint, changed } = triggerPaint(opening.rest, rootRaw, spec.open, identity);
        if (changed)
          errors.push(
            `${changed} element(s) inside trigger ${spec.open.id} appear or disappear while its layer is open; not reproduced`,
          );
        if (spec.probeDismiss && layer.placement !== "inflow") candidates = dismissCandidates(marked, paths, identity);
        opened = { layer, size, openPaint: paint };
      }
      let png: Uint8Array | undefined;
      if (spec.screenshot) {
        const { x, y, w, h } = box;
        if (!(size.w > 0 && size.h > 0) || x + w <= 0 || y + h <= 0)
          throw new Error(
            `capture root ${spec.root} has an empty or off-page box (${w}×${h} at ${x},${y}); nothing to screenshot`,
          );
        await cancelAncestorTransforms(page);
        png = await page.screenshot({
          clip: { x, y, width: size.w, height: size.h },
          scale: "device",
          animations: "disabled",
          caret: "hide",
          type: "png",
        });
      }
      // 066: exit — what closing starts on the same roots (light page only; the dark layer copies it, api/bands.ts).
      const readExit = async (layer: NonNullable<typeof opened>["layer"]) => {
        const exit = await readElementAnimations(page, roots);
        errors.push(...exit.warnings);
        exit.lists.forEach((list, i) => {
          if (list.length) layer.nodes[i]!.motion = { ...layer.nodes[i]!.motion, exit: list };
        });
        animated ||= exit.lists.some((l) => l.length);
      };
      if (opened && opening && spec.open && spec.probeDismiss && opened.layer.placement !== "inflow") {
        await recordAnimations(page);
        await page.keyboard.press("Escape");
        // 066: exit read — same roots, before settle
        await readExit(opened.layer);
        await settle(page);
        opened.layer.dismiss = await probeDismiss(page, opening, {
          root: rootSel,
          trigger: spec.open,
          candidates,
          viewport,
          escape: !(await opening.isOpen()),
          warn: (message) => errors.push(message),
        });
      }
      // An in-flow layer closes on a second activation of its trigger.
      if (opened && spec.open && spec.probeDismiss && opened.layer.placement === "inflow") {
        await activate(page, rootSel, spec.open);
        await readExit(opened.layer);
      }
      if (animated && motion.authorReduce)
        errors.push(
          "overlay enter/exit animations follow the Reduce Motion fallback (author prefers-reduced-motion rules for them are not captured)",
        );
      await cdp.detach();
      await Promise.all(imageReads);
      const baseURI = await page.evaluate(() => document.baseURI);
      for (const node of [root, ...(opened?.layer.nodes ?? [])])
        errors.push(...inlineCapturedImages(node, baseURI, images));
      return {
        warnings: [...errors.map((message) => ({ source: "capture" as const, message })), ...conditional.warnings],
        layout: {
          version: LAYOUT_DOC_VERSION,
          source,
          combo: { screen: spec.screen, theme: spec.theme },
          size,
          // `|| 0`: a root at the page origin gives -0, which JSON and deep equality treat differently.
          viewport: { x: -box.x || 0, y: -box.y || 0, w: viewport.width, h: viewport.height },
          conditions,
          dpr: this.opts.dpr,
          canvas,
          fonts,
          root,
        },
        png,
        fontFiles,
        ...(triggers ? { triggers } : {}),
        ...(opened ? { opened } : {}),
      };
    } finally {
      await page.close();
    }
  }

  /** Viewport, colour scheme, routes, navigation, `waitFor` and `prepare` of one capture request. */
  private async load(page: Page, spec: CaptureRequest): Promise<void> {
    if (spec.viewport) await page.setViewportSize(spec.viewport);
    await page.emulateMedia({ colorScheme: spec.theme });
    // Public pasted markup is captured as a document, but cannot reach the host's network.
    // The exact document route below is registered last and fulfills that one request.
    // `aborted` (net::ERR_ABORTED) cancels a navigation (meta refresh, link) without committing
    // Chrome's error page, so the pasted document stays the one captured.
    if (this.opts.restricted) await page.route("**/*", (route) => route.abort("aborted"));
    if (spec.html !== undefined) {
      const documentURL = new URL(spec.url);
      documentURL.hash = "";
      await page.route(
        (url) => url.href === documentURL.href,
        (route) =>
          route.request().isNavigationRequest()
            ? route.fulfill({
                contentType: "text/html; charset=utf-8",
                body: spec.html!,
                ...(this.opts.restricted
                  ? {
                      headers: {
                        "Content-Security-Policy":
                          "default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'",
                      },
                    }
                  : {}),
              })
            : this.opts.restricted
              ? route.abort()
              : route.continue(),
      );
    }
    await page.goto(spec.url, { waitUntil: "load" });
    await page.waitForSelector(spec.waitFor ?? spec.root, { state: "attached", timeout: 15_000 });
    await spec.prepare?.(page);
  }

  /**
   * Motion frame: the same page with every animation paused `frame.t` ms in (`reduced`: under
   * `prefers-reduced-motion: reduce`, else `no-preference`), screenshotted at `clip` — the rest capture's root box.
   */
  async captureFrame(
    spec: CaptureRequest,
    frame: { t: number; reduced: boolean },
    clip: { x: number; y: number; width: number; height: number },
  ): Promise<Uint8Array> {
    const page = await this.context.newPage();
    try {
      if (!frame.reduced) await page.emulateMedia({ reducedMotion: "no-preference" });
      await this.load(page, spec);
      await noTransitions(page);
      await settle(page, { at: frame.t });
      await page.evaluate(({ sel, mark }) => document.querySelector(sel)?.setAttribute(mark, "1"), {
        sel: spec.root,
        mark: ROOT_MARK,
      });
      await markTransformed(page);
      await cancelAncestorTransforms(page);
      return await page.screenshot({ clip, scale: "device", animations: "allow", caret: "hide", type: "png" });
    } finally {
      await page.close();
    }
  }
}
