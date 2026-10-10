import type { Page } from "playwright-core";

/**
 * Fonts loaded, animations finished, one frame painted.
 * `content-visibility: auto` subtrees are forced to lay out (off-screen content
 * would otherwise be missing from the snapshot); the contents of
 * `content-visibility: hidden` elements (`hidden=until-found`) are removed from
 * layout because DOMSnapshot still reports boxes for them while nothing paints. Lazy images
 * are loaded eagerly so below-the-fold pixels exist.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const img of document.images) if (img.loading === "lazy") img.loading = "eager";
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await document.fonts.ready;
    for (const el of document.querySelectorAll("*")) {
      const cv = getComputedStyle(el).contentVisibility;
      if (cv === "auto") (el as HTMLElement).style.setProperty("content-visibility", "visible", "important");
      else if (cv === "hidden") for (const c of el.children) (c as HTMLElement).style.setProperty("display", "none", "important");
    }
    for (const a of document.getAnimations()) {
      try {
        a.finish();
      } catch {
        a.cancel();
      }
    }
    const frame = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => frame.resolve()));
    await frame.promise;
  });
}
