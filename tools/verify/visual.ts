import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { compileLayout, compileResponsiveLayouts } from "../../src/compiler/index.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { loadVisualFixture, visualFixtures, type Theme, type VisualFixture } from "./visual-fixtures.ts";
import { compareVisualCapture } from "./visual-checks.ts";
import { renderVisualSnapshots, type VisualSnapshot } from "./visual-native.ts";

const widths = [390, 320] as const;
const themes = ["light", "dark"] as const;
const dpr = 2;
const out = join(import.meta.dir, "..", "..", "out", "visual-smoke");

async function captureAt(fixture: VisualFixture, width: number, theme: Theme, html: string, css: string): Promise<Capture> {
  const browser = new BrowserCapture({ dpr, viewport: { width, height: 1000 } });
  await browser.start();
  try {
    const capture = await browser.capture({
      key: fixture.id, screen: fixture.id, theme,
      url: `http://markswift.local/visual-smoke-${fixture.id}-${theme}-${width}`,
      html, root: "[data-markswift-root]",
      prepare: async page => { await page.addStyleTag({ content: css }); },
    }, htmlIdentity, `visual-smoke/${fixture.id}`);
    if (capture.layout.size.w !== width || capture.layout.size.h !== fixture.height) {
      throw new Error(`Chrome ${fixture.id} ${theme} ${width}: unexpected root size ${capture.layout.size.w}×${capture.layout.size.h}`);
    }
    if (capture.fontFiles.length) throw new Error(`Visual smoke fixture ${fixture.id} unexpectedly needs bundled fonts`);
    return capture;
  } finally {
    await browser.stop();
  }
}

function snapshotsFor(fixture: VisualFixture, theme: Theme, captures: Map<number, Capture>): VisualSnapshot[] {
  const regular = captures.get(390)!;
  const name = `${fixture.name}App`;
  const app = fixture.responsive
    ? compileResponsiveLayouts({
      name, breakpoint: 350, mode: "app",
      compact: { layout: captures.get(320)!.layout, viewportWidth: 320 },
      regular: { layout: regular.layout, viewportWidth: 390 },
    })
    : compileLayout(regular.layout, { name, mode: "app" });
  const output = (mode: string, width: number) => join(out, `${fixture.id}-${theme}-${mode}-${width}-ios.png`);
  return [
    { bundle: app, layout: regular.layout, hosted: fixture.id === "form", outputs: Object.fromEntries(widths.map(width => [width, output("app", width)])) },
    // Fidelity freezes measured geometry: each snapshot uses its own captured width.
    ...widths.map(width => ({
      bundle: compileLayout(captures.get(width)!.layout, { name: `${fixture.name}Fidelity${width}`, mode: "fidelity" }),
      layout: captures.get(width)!.layout, outputs: { [width]: output("fidelity", width) },
    })),
  ];
}

async function main(): Promise<void> {
  await mkdir(out, { recursive: true });
  const failures: string[] = [];
  let compared = 0;
  const requested = process.env.MARKSWIFT_VISUAL_FIXTURES?.split(",");
  if (requested?.some(id => !visualFixtures.some(fixture => fixture.id === id))) throw new Error("Unknown MARKSWIFT_VISUAL_FIXTURES entry");
  const fixtures = requested ? visualFixtures.filter(fixture => requested.includes(fixture.id)) : visualFixtures;
  for (const fixture of fixtures) {
    const { html, css } = await loadVisualFixture(fixture);
    for (const theme of themes) {
      const captures = new Map<number, Capture>();
      const browserPath = (width: number) => join(out, `${fixture.id}-${theme}-${width}-chrome.png`);
      for (const width of widths) {
        const capture = await captureAt(fixture, width, theme, html, css);
        captures.set(width, capture);
        await Bun.write(browserPath(width), capture.png);
      }
      const snapshots = snapshotsFor(fixture, theme, captures);
      await renderVisualSnapshots(snapshots, join(out, "native-work"));
      for (const [index, snapshot] of snapshots.entries()) for (const [widthString, nativePath] of Object.entries(snapshot.outputs)) {
        const width = Number(widthString);
        const label = `${fixture.id} ${theme} ${index === 0 ? "app" : "fidelity"} ${width}`;
        try {
          await compareVisualCapture(browserPath(width), nativePath, captures.get(width)!, fixture, label, dpr);
        } catch (error) {
          failures.push(`${label}: ${error instanceof Error ? error.message : error}`);
        }
        compared++;
      }
    }
  }
  console.log(`${compared} comparisons; images: ${out}`);
  if (compared !== fixtures.length * 8) throw new Error("Visual matrix is incomplete");
  if (failures.length) throw new Error(`Visual smoke failed:\n${failures.join("\n")}`);
}

await main();
