import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { GEOMETRY_HTML, GEOMETRY_CSS, GEOMETRY_WIDTHS } from "./geometry-fixture.ts";
import { readChromeGeometry } from "./geometry-chrome.ts";
import { compareGeometry, type ChromeGeometry } from "./geometry.ts";
import { renderVisualSnapshots, type VisualSnapshot } from "./visual-native.ts";
import { meanRgbError } from "./visual-metrics.ts";
import { readSourceSnapshot, verifySourceSnapshot } from "./corpus-snapshot.ts";

export type GeometryProofFixture = { html: string; css: string; selector: string; height: number; name: string; scrollSourceId?: string };
const defaultFixture: GeometryProofFixture = { html: GEOMETRY_HTML, css: GEOMETRY_CSS, selector: "#geometry-root", height: 800, name: "GeometryProbe", scrollSourceId: "#scroll" };

/** Preparing this proof only uses fresh Chrome pages; native execution is a separate explicit step. */
export async function prepareGeometryProof(work: string, hosted = true, fixture = defaultFixture) {
  await mkdir(work, { recursive: true });
  const captured = await convertHtml(fixture.html, { css: fixture.css, viewport: { width: 390, height: fixture.height } });
  const options = { name: fixture.name, mode: hosted ? "app" as const : "fidelity" as const };
  const plain = compileLayout(captured.layout, options);
  const observed = compileLayout(captured.layout, { ...options, geometryInstrumentation: true });
  const widths = hosted ? [...GEOMETRY_WIDTHS] : [390];
  const expected: Record<number, ChromeGeometry> = {};
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: fixture.height }, deviceScaleFactor: 2 });
      await page.setContent(`<style>${fixture.css}</style>${fixture.html}`);
      expected[width] = await readChromeGeometry(page, fixture.selector);
      await Bun.write(join(work, `chrome-${width}.json`), JSON.stringify(expected[width], null, 2));
      await page.locator(fixture.selector).screenshot({ path: join(work, `chrome-${width}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
  await Bun.write(join(work, "capture-390.json"), JSON.stringify(captured.layout, null, 2));
  await Bun.write(join(work, "manifest.json"), JSON.stringify(observed.geometry, null, 2));
  const outputs = (suffix: string) => Object.fromEntries(widths.map(width => [width, join(work, `native-${width}-${suffix}`)]));
  const jobs: VisualSnapshot[] = [
    { bundle: plain, layout: captured.layout, outputs: outputs("plain.png"), hosted },
    { bundle: observed, layout: captured.layout, outputs: outputs("observed.png"), geometryOutputs: outputs("actual.json"), hosted },
  ];
  return { captured, observed, expected, widths, jobs };
}

/** Uses real hosted SwiftUI or ImageRenderer anchor frames and checks observer pixel neutrality. */
export async function runGeometryProof(work: string, hosted = true, fixture = defaultFixture) {
  const directory = resolve(import.meta.dir, "../..");
  const source = await readSourceSnapshot(directory);
  if (!source) throw new Error("Actual geometry proof requires an immutable source/dependency snapshot");
  await verifySourceSnapshot(directory);
  const proof = await prepareGeometryProof(work, hosted, fixture);
  const rendering = await renderVisualSnapshots(proof.jobs, join(work, "native"));
  const results = [];
  for (const width of proof.widths) {
    const actual = await Bun.file(proof.jobs[1]!.geometryOutputs![width]!).json();
    const comparison = compareGeometry(proof.observed.geometry!, actual, proof.expected[width]!);
    let actualScrollExtent: number | undefined, expectedScrollExtent: number | undefined, scrollExtentError: number | undefined;
    if (fixture.scrollSourceId) {
      const scrollElement = proof.expected[width]!.elements.find(element => element.sourceId === fixture.scrollSourceId)!;
      const contentEntry = proof.observed.geometry!.nodes.find(node => node.sourceId === fixture.scrollSourceId && node.role === "scroll-content")!;
      const viewportEntry = proof.observed.geometry!.nodes.find(node => node.sourceId === fixture.scrollSourceId && node.role === "scroll-viewport")!;
      const contentFrame = actual.frames.find((frame: { key: string }) => frame.key === contentEntry?.key);
      const viewportFrame = actual.frames.find((frame: { key: string }) => frame.key === viewportEntry?.key);
      if (!contentFrame || !viewportFrame || !scrollElement?.scroll || scrollElement.scroll.transformed) throw new Error("Geometry proof needs actual untransformed scroll content and viewport observations");
      actualScrollExtent = Math.max(0, contentFrame.h - viewportFrame.h);
      expectedScrollExtent = Math.max(0, scrollElement.scroll.height - scrollElement.scroll.viewportHeight);
      scrollExtentError = Math.abs(actualScrollExtent - expectedScrollExtent);
    }
    const observerPixelError = await meanRgbError(proof.jobs[0]!.outputs[width]!, proof.jobs[1]!.outputs[width]!, width, proof.captured.layout.size.h, 2);
    // A deliberately changed actual frame must be rejected by the same comparator.
    const changed = structuredClone(actual);
    const sampled = changed.frames.find((frame: { key: string }) => comparison.deltas.some(delta => delta.key === frame.key));
    if (!sampled) throw new Error("Geometry proof had no comparable native frames");
    sampled.x += 7;
    const injectedFaultDetected = !compareGeometry(proof.observed.geometry!, changed, proof.expected[width]!).matchingFrames;
    results.push({ width, comparison, observerPixelError, injectedFaultDetected, actualScrollExtent, expectedScrollExtent, scrollExtentError,
      pass: comparison.matchingFrames && comparison.complete && observerPixelError === 0 && injectedFaultDetected && (!hosted || scrollExtentError === undefined || scrollExtentError <= 0.5) });
  }
  await verifySourceSnapshot(directory);
  const result = { version: 1, backend: hosted ? "hosted" : "image-renderer", source: { directory, sourceHash: source.sourceHash, dependencyHash: source.dependencyHash, policy: source.policy, createdAt: source.createdAt }, ...rendering, results };
  await Bun.write(join(work, "result.json"), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const work = resolve(process.argv[2] ?? "out/goal/geometry-proof");
  const hosted = !process.argv.includes("--image-renderer");
  if (process.argv.includes("--prepare")) {
    const prepared = await prepareGeometryProof(work, hosted);
    console.log(JSON.stringify({ work, widths: prepared.widths, manifest: prepared.observed.geometry }, null, 2));
  } else {
    const result = await runGeometryProof(work, hosted);
    console.log(JSON.stringify(result, null, 2));
    if (result.results.some(row => !row.pass)) process.exitCode = 1;
  }
}
