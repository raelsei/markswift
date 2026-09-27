import type { Page } from "playwright-core";
import type { InteractionStep } from "./types.ts";

export const browserAdditiveModifier = process.platform === "darwin" ? "Meta" : "Control";

/** Every transition is a pointer/keyboard gesture. No fill(), selectOption(), or DOM state writes. */
export async function browserGesture(page: Page, step: InteractionStep, selector: string): Promise<string | undefined> {
  const locator = page.locator(selector);
  if (step.kind === "tap") {
    const multiple = await locator.evaluate(element => element instanceof HTMLOptionElement && !!element.closest("select")?.multiple);
    await locator.click({ ...(multiple ? { modifiers: [browserAdditiveModifier] } : {}) });
    return multiple ? `${browserAdditiveModifier}-click (native additive row tap)` : "click";
  }
  if (step.kind === "tapInert") {
    const inert = await locator.evaluate(element => element.matches(":disabled") || !!element.closest("select:disabled") || getComputedStyle(element).visibility === "hidden");
    if (!inert) throw new Error(`Browser inert tap target is not inert: ${step.target}`);
    await locator.hover();
    const rect = await locator.boundingBox();
    if (!rect) throw new Error(`Browser inert target has no pointer rectangle: ${step.target}`);
    // The coordinate is used only for a negative disabled-control test. State is never assigned.
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return "pointer click at disabled control center (negative test)";
  }
  if (step.kind === "replaceText") {
    await locator.click(); await locator.press(`${browserAdditiveModifier}+A`); await locator.press("Backspace");
    await page.keyboard.type(step.text);
    return `click, ${browserAdditiveModifier}+A, Backspace, keyboard.type`;
  }
  if (step.kind === "scroll") {
    await locator.hover(); await page.mouse.wheel(0, step.direction === "up" ? 150 : -150);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return `pointer wheel ${step.direction === "up" ? "+150" : "-150"} (native swipe ${step.direction})`;
  }
}
