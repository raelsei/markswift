import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CorpusFixture } from "../corpus-model.ts";
import { digest } from "../corpus-evidence.ts";
import { browserControlSelectors } from "./browser-identity.ts";
import { browserAdditiveModifier, browserGesture } from "./browser-actions.ts";
import { browserBackendNodes, observeBrowserControls } from "./browser-observe.ts";
import type { BrowserOracle } from "./browser-types.ts";
import type { InteractionPlan } from "./types.ts";

/** Independent oracle: expected state comes from original live DOM/AX, never inferred semantic state. */
export async function captureBrowserOracle(fixture: CorpusFixture, plan: InteractionPlan, directory: string): Promise<{ oracle: BrowserOracle; hashes: Record<string, string> }> {
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: plan.width, height: 1400 }, deviceScaleFactor: 2, colorScheme: plan.theme });
    const page = await context.newPage();
    await page.route("**/*", route => route.abort());
    await page.setContent(fixture.html); await page.addStyleTag({ content: fixture.css }); await page.evaluate(() => document.fonts.ready);
    const selectors = await browserControlSelectors(page, fixture.rootSelector);
    const cdp = await context.newCDPSession(page), backend = await browserBackendNodes(cdp, selectors);
    const oracle: BrowserOracle = { version: 1, fixture: fixture.id, browser: browser.version(), platform: process.platform,
      multipleSelectionGesture: `native additive row tap -> Chrome ${browserAdditiveModifier}-click; plain click replaces multi-selection`, snapshots: [] };
    const hashes: Record<string, string> = {};
    const snapshot = async (index: number, gesture?: string) => {
      const ax = await cdp.send("Accessibility.getFullAXTree");
      const controls = await observeBrowserControls(page, selectors, backend, ax.nodes.flatMap(node => !node.ignored && node.backendDOMNodeId !== undefined ? [node.backendDOMNodeId] : []));
      const name = String(index).padStart(3, "0"), accessibility = `${name}-ax.json`, screenshot = `${name}-chrome.png`;
      const axText = JSON.stringify(ax, null, 2) + "\n", png = await page.locator(fixture.rootSelector).screenshot();
      await writeFile(join(directory, accessibility), axText); await writeFile(join(directory, screenshot), png);
      hashes[accessibility] = digest(axText); hashes[screenshot] = digest(png);
      oracle.snapshots.push({ index, ...(index ? { step: plan.steps[index - 1] } : {}), ...(gesture ? { gesture } : {}), controls, screenshot, accessibility });
    };
    await snapshot(0);
    for (const [index, step] of plan.steps.entries()) {
      const selector = selectors[step.target];
      if (!selector) throw new Error(`Oracle cannot resolve original HTML identity ${step.target}`);
      const gesture = await browserGesture(page, step, selector);
      await snapshot(index + 1, gesture);
    }
    const text = JSON.stringify(oracle, null, 2) + "\n";
    await writeFile(join(directory, "oracle.json"), text); hashes["oracle.json"] = digest(text);
    return { oracle, hashes };
  } finally { await browser.close(); }
}

/** Retain authored assertions; a disagreement with observed browser behavior fails preparation. */
export function freezeBrowserExpectations(plan: InteractionPlan, oracle: BrowserOracle): InteractionPlan {
  if (oracle.fixture !== plan.fixture || oracle.snapshots.length !== plan.steps.length + 1) throw new Error("Browser oracle does not match the interaction plan");
  const transitionCount = plan.steps.filter((step, index) => {
    if (step.kind !== "tap" && step.kind !== "replaceText") return false;
    const before = oracle.snapshots[index]!.controls[step.target], after = oracle.snapshots[index + 1]!.controls[step.target];
    const state = (value: typeof before) => [value?.value, value?.checked, value?.selected, value?.selectedOrdinals, value?.expanded];
    return JSON.stringify(state(before)) !== JSON.stringify(state(after));
  }).length;
  return { ...plan, transitionCount, steps: plan.steps.map((step, index) => {
    const observed = oracle.snapshots[index + 1]!.controls[step.target];
    if (!observed) throw new Error(`Browser observation missing: ${step.target}`);
    const mismatch = () => { throw new Error(`Frozen assertion disagrees with direct browser state at ${plan.fixture}/${index + 1}/${step.target}`); };
    switch (step.kind) {
      case "expectExpanded": if (step.expanded !== observed.expanded) mismatch(); return { ...step, expanded: observed.expanded! };
      case "expectPresent": if (step.present !== (observed.visible && observed.accessible)) mismatch(); return step;
      case "expectMissing": if (observed.accessible || observed.visible) mismatch(); return step;
      case "expectSelection": if (step.selected !== observed.selected) mismatch(); return { ...step, selected: observed.selected! };
      case "expectValue": {
        const value = observed.checked !== undefined ? observed.checked ? "selected" : "unselected" : observed.value ?? "";
        if (step.value !== value) mismatch(); return { ...step, value };
      }
      case "expectLabel": if (step.label !== observed.label) mismatch(); return { ...step, label: observed.label };
      case "expectEnabled": if (step.enabled === observed.disabled) mismatch(); return { ...step, enabled: !observed.disabled };
      default: return step;
    }
  }) };
}
