import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compileLayouts, type CompileLayoutInput } from "../../src/compiler/batch.ts";
import type { CorpusFixture } from "./corpus-model.ts";
import { CorpusCapture, corpusFonts, type CorpusCaptureResult } from "./corpus-capture.ts";
import { saveCorpusGeometry } from "./corpus-geometry.ts";
import { compareCorpusImages } from "./corpus-metrics.ts";
import { saveAppearanceArtifacts } from "./corpus-artifacts.ts";
import { createCorpusRun, digest, saveCorpusCheckpoint, sourceDigest, type CorpusRun, type CorpusComparison } from "./corpus-evidence.ts";
import { renderVisualSnapshots, type VisualSnapshot } from "./visual-native.ts";

export interface CorpusRunOptions {
  widths: number[]; themes: CorpusRun["themes"]; modes: CorpusRun["modes"];
  outputRoot: string; batchSize?: number;
  geometry?: boolean;
}
interface CapturedCase { fixture: CorpusFixture; theme: "light" | "dark"; captures: Map<number, CorpusCaptureResult>; base: string }
interface PlannedView { name: string; item: CapturedCase; mode: "app" | "fidelity"; capture: CorpusCaptureResult; outputs: Record<number, string> }

/** Independent appearance and native geometry evidence; real interactions and acceptance remain separate. */
export async function runCorpus(fixtures: readonly CorpusFixture[], options: CorpusRunOptions): Promise<{ run: CorpusRun; directory: string }> {
  if (!fixtures.length || !options.widths.length || !options.themes.length || !options.modes.length) throw new Error("Corpus matrix must not be empty");
  if (!Number.isInteger(options.batchSize ?? 4) || (options.batchSize ?? 4) < 1) throw new Error("Invalid corpus batch size");
  const cwd = join(import.meta.dir, "../.."), browser = new CorpusCapture();
  const run = await createCorpusRun(fixtures, options.widths, options.themes, options.modes, cwd);
  run.geometryRequired = options.geometry ?? true;
  run.nativeExecutionRequired = true;
  const directory = resolve(options.outputRoot, run.runID);
  await mkdir(options.outputRoot, { recursive: true });
  await mkdir(directory, { recursive: false });
  const batchSize = options.batchSize ?? 4;
  try {
    for (let start = 0; start < fixtures.length; start += batchSize) {
      const batch = fixtures.slice(start, start + batchSize), captured: CapturedCase[] = [];
      for (const fixture of batch) {
        const base = join(directory, fixture.id); await mkdir(base);
        await writeFile(join(base, "source.html"), fixture.html); await writeFile(join(base, "source.css"), fixture.css);
        for (const theme of options.themes) {
          const item: CapturedCase = { fixture, theme, captures: new Map(), base }; captured.push(item);
          for (const width of options.widths) {
            try {
              const capture = await browser.capture(fixture, width, theme); item.captures.set(width, capture);
              await writeFile(join(base, `${theme}-${width}-chrome.png`), capture.png);
              await writeFile(join(base, `${theme}-${width}-layout.json`), JSON.stringify(capture.layout));
              await writeFile(join(base, `${theme}-${width}-chrome-geometry.json`), JSON.stringify(capture.geometry));
            } catch (error) {
              for (const mode of options.modes) run.comparisons.push({ ...identity(item, mode, width), status: "capture-failed", error: message(error) });
            }
          }
        }
      }
      const fontWork = join(directory, `fonts-${start}`);
      let resources: Awaited<ReturnType<typeof corpusFonts>>;
      try { resources = await corpusFonts(captured.flatMap(item => [...item.captures.values()]), fontWork); }
      catch (error) {
        for (const item of captured) for (const width of item.captures.keys()) for (const mode of options.modes) {
          run.comparisons.push({ ...identity(item, mode, width), status: "compile-render-failed", error: `Font resources: ${message(error)}` });
        }
        await saveCorpusCheckpoint(run, directory);
        continue;
      }
      const plans: PlannedView[] = [], inputs: CompileLayoutInput[] = [];
      for (const item of captured) {
        const prefix = `Corpus${fixtures.indexOf(item.fixture)}${item.theme === "light" ? "Light" : "Dark"}`;
        if (options.modes.includes("app")) {
          const regular = item.captures.get(390);
          if (regular) {
            const name = `${prefix}App`;
            const outputs = Object.fromEntries([...item.captures.keys()].map(width => [width, join(item.base, `${item.theme}-app-${width}-ios.png`)]));
            plans.push({ name, item, mode: "app", capture: regular, outputs }); inputs.push({ ...resources, name, layout: regular.layout, mode: "app", geometryInstrumentation: run.geometryRequired });
          } else for (const width of item.captures.keys()) run.comparisons.push({ ...identity(item, "app", width), status: "compile-render-failed", error: "App requires one regular390 capture" });
        }
        if (options.modes.includes("fidelity")) for (const [width, capture] of item.captures) {
          const name = `${prefix}Fidelity${width}`;
          const outputs = { [width]: join(item.base, `${item.theme}-fidelity-${width}-ios.png`) };
          plans.push({ name, item, mode: "fidelity", capture, outputs }); inputs.push({ ...resources, name, layout: capture.layout, mode: "fidelity", geometryInstrumentation: run.geometryRequired });
        }
      }
      if (inputs.length) {
        try {
          const bundle = compileLayouts(inputs), swiftHash = digest(JSON.stringify(bundle.files));
          const work = join(directory, `native-${start}`);
          const snapshots: VisualSnapshot[] = plans.map(plan => ({
            moduleID: `batch-${start}`, bundle: { name: plan.name, files: bundle.files, assets: bundle.assets },
            layout: plan.capture.layout, hosted: plan.item.fixture.hosted, outputs: plan.outputs,
            ...(run.geometryRequired ? { geometryOutputs: Object.fromEntries(Object.keys(plan.outputs).map(width =>
              [width, join(plan.item.base, `${plan.item.theme}-${plan.mode}-${width}-ios-geometry.json`)])) } : {}),
          }));
          const nativeEvidence = await renderVisualSnapshots(snapshots, work);
          run.bundleArtifacts[swiftHash] = nativeEvidence.artifactHashes;
          run.environment.selectedSimulator = nativeEvidence.simulator;
          for (const plan of plans) for (const [widthString, native] of Object.entries(plan.outputs)) {
            const width = Number(widthString), reference = join(plan.item.base, `${plan.item.theme}-${width}-chrome.png`);
            const capture = plan.item.captures.get(width)!, view = bundle.views.find(view => view.name === plan.name)!;
            const comparison: CorpusComparison = {
              ...identity(plan.item, plan.mode, width), status: "appearance-failed", reference, native,
              layoutHash: digest(JSON.stringify(capture.layout)), sourceLayoutHash: digest(JSON.stringify(plan.capture.layout)),
              swiftHash, diagnostics: view.diagnostics,
              warnings: [...capture.warnings, ...resources.warnings],
            };
            try {
              const artifacts = [...new Set([reference, native, join(plan.item.base, `${plan.item.theme}-${width}-layout.json`),
                join(plan.item.base, `${plan.item.theme}-${plan.mode === "app" ? 390 : width}-layout.json`),
                join(plan.item.base, "source.html"), join(plan.item.base, "source.css")])];
              comparison.artifactHashes = Object.fromEntries(await Promise.all(artifacts.map(async path => [path, digest(await readFile(path))])));
              const appearance = await compareCorpusImages(reference, native, capture.layout, plan.item.fixture.regions);
              const saved = await saveAppearanceArtifacts(appearance, reference, native,
                join(plan.item.base, `${plan.item.theme}-${plan.mode}-${width}`));
              comparison.appearance = saved.appearance;
              comparison.artifactHashes = { ...comparison.artifactHashes, ...saved.artifactHashes };
              if (run.geometryRequired) {
                if (!view.geometry) throw new Error("Generated view has no geometry manifest");
                const geometry = await saveCorpusGeometry(view.geometry,
                  join(plan.item.base, `${plan.item.theme}-${plan.mode}-${width}-ios-geometry.json`),
                  join(plan.item.base, `${plan.item.theme}-${width}-chrome-geometry.json`),
                  join(plan.item.base, `${plan.item.theme}-${plan.mode}-${width}`), plan.mode);
                comparison.geometry = geometry.geometry;
                comparison.artifactHashes = { ...comparison.artifactHashes, ...geometry.artifactHashes };
              }
              comparison.status = appearance.failures.length ? "appearance-failed" : "passed";
              if (comparison.status === "passed" && run.geometryRequired && !comparison.geometry?.passed) comparison.status = "geometry-failed";
            } catch (error) { comparison.error = message(error); }
            run.comparisons.push(comparison);
          }
        } catch (error) {
          for (const plan of plans) for (const width of Object.keys(plan.outputs).map(Number)) {
            run.comparisons.push({ ...identity(plan.item, plan.mode, width), status: "compile-render-failed", error: message(error) });
          }
        }
      }
      await saveCorpusCheckpoint(run, directory);
      console.log(`Corpus ${Math.min(start + batchSize, fixtures.length)}/${fixtures.length}: ${run.comparisons.filter(item => item.status === "passed").length}/${run.comparisons.length} ${run.geometryRequired ? "appearance + geometry" : "appearance-only"} gates passed`);
    }
    const endingSource = await sourceDigest(cwd);
    if (endingSource !== run.sourceHash) run.environment.sourceChangedDuringRun = endingSource;
    await saveCorpusCheckpoint(run, directory, true);
    console.log(`Corpus evidence: ${join(directory, "final.json")}; goal remains pending independent acceptance`);
    return { run, directory };
  } finally { await browser.stop(); }
}
function identity(item: CapturedCase, mode: "app" | "fidelity", width: number): Pick<CorpusComparison, "fixture" | "category" | "split" | "theme" | "mode" | "width"> {
  return { fixture: item.fixture.id, category: item.fixture.category, split: item.fixture.split, theme: item.theme, mode, width };
}
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
