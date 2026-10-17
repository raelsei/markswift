import type { CDPSession, Page } from "playwright-core";

/**
 * Fonts loaded, animations finished, one frame painted.
 * `content-visibility: auto` subtrees are forced to lay out (off-screen content
 * would otherwise be missing from the snapshot); the contents of
 * `content-visibility: hidden` elements (`hidden=until-found`) are removed from
 * layout because DOMSnapshot still reports boxes for them while nothing paints. Lazy images
 * are loaded eagerly so below-the-fold pixels exist.
 * `at` (ms): every animation is paused at that time instead of finished (motion frame captures), including the ones
 * `recordAnimations` kept that already finished (a 100 ms overlay enter, 066).
 */
export async function settle(page: Page, options: { at?: number } = {}): Promise<void> {
  await page.evaluate(async (at) => {
    for (const img of document.images) if (img.loading === "lazy") img.loading = "eager";
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await document.fonts.ready;
    for (const el of document.querySelectorAll("*")) {
      const cv = getComputedStyle(el).contentVisibility;
      if (cv === "auto") (el as HTMLElement).style.setProperty("content-visibility", "visible", "important");
      else if (cv === "hidden")
        for (const c of el.children) (c as HTMLElement).style.setProperty("display", "none", "important");
    }
    const recorded = at === null ? [] : (window.__markswiftStarted ?? []).filter((a) => a.playState === "finished");
    for (const a of new Set([...document.getAnimations(), ...recorded])) {
      if (at !== null) {
        a.pause();
        a.currentTime = at;
        continue;
      }
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    const frame = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => frame.resolve()));
    await frame.promise;
  }, options.at ?? null);
}

/** Finish (or, for infinite ones, cancel) every running animation: the settled look `settle()` leaves. */
export async function finishAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
  });
}

/**
 * Runs `shot` with every indeterminate `<progress>` painted at its first frame. Blink draws one with a native
 * appearance from the clock (`LayoutProgress::AnimationProgress()`: `(TimeTicks::Now() - start) % 2.5 s`, repainted
 * every 125 ms), outside Web Animations, so `settle()` and reduced motion don't reach it. CDP virtual time, paused,
 * freezes the renderer's clock; the bars are hidden before and shown after, so their new layout objects start at that
 * instant and paint at progress 0. Pausing while a frame is in flight stalls every later frame (the screenshot never
 * returns), so a 1 px screenshot first waits until the hidden bars' frame is presented. A page without such a bar is
 * left alone; one with it keeps virtual time, set to `advance` (timers still fire) after `shot`.
 */
export async function withFrozenProgress<T>(page: Page, cdp: CDPSession, shot: () => Promise<T>): Promise<T> {
  const hidden = await page.evaluateHandle(() =>
    [...document.querySelectorAll<HTMLElement>("progress:indeterminate")]
      .filter((p) => getComputedStyle(p).appearance !== "none")
      .map((p) => {
        const style = p.getAttribute("style");
        p.style.setProperty("display", "none", "important");
        return { p, style };
      }),
  );
  try {
    if (!(await hidden.evaluate((list) => list.length))) return await shot();
    await cdp.send("Page.captureScreenshot", { clip: { x: 0, y: 0, width: 1, height: 1, scale: 1 } });
    await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
    await hidden.evaluate((list) => {
      for (const { p, style } of list)
        if (style === null) p.removeAttribute("style");
        else p.setAttribute("style", style);
    });
    try {
      return await shot();
    } finally {
      await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" });
    }
  } finally {
    await hidden.dispose();
  }
}
