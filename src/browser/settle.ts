import type { Page } from "playwright-core";

/**
 * Fonts loaded, animations finished, `hide` selectors hidden, one frame painted.
 * `content-visibility: auto` subtrees are forced to lay out (off-screen content
 * would otherwise be missing from the snapshot); the contents of
 * `content-visibility: hidden` elements (`hidden=until-found`) are removed from
 * layout because DOMSnapshot still reports boxes for them while nothing paints.
 */
export async function settle(page: Page, hide: string[]): Promise<void> {
  await page.evaluate(async (hide) => {
    await document.fonts.ready;
    for (const sel of hide) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = "none";
    }
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
  }, hide);
}
