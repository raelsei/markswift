import type { CDPSession, Page } from "playwright-core";
import type { SourceContentVisibility } from "./content-visibility.ts";
import { settleVisibility } from "./settle-visibility.ts";

/**
 * Fonts loaded, animations finished, `hide` selectors hidden, one frame painted.
 * `content-visibility: auto` subtrees are forced to lay out (off-screen content
 * would otherwise be missing from the snapshot); the contents of
 * `content-visibility: hidden` elements (`hidden=until-found`) are removed from
 * layout because DOMSnapshot still reports boxes for them while nothing paints.
 */
export async function settle(page: Page, hide: string[], beforeVisibility?: () => Promise<void>, cdp?: CDPSession): Promise<SourceContentVisibility> {
  await page.evaluate(async (hide) => {
    await document.fonts.ready;
    for (const sel of hide) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = "none";
    }
  }, hide);
  await beforeVisibility?.();
  return await settleVisibility(page, cdp);
}
