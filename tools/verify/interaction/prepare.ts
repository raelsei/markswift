import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { compileLayouts } from "../../../src/compiler/batch.ts";
import type { Capture } from "../../../src/browser/capture.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { walk, type ControlNode } from "../../../src/model/semantic.ts";
import type { CorpusFixture } from "../corpus-model.ts";
import { CorpusCapture, corpusFonts } from "../corpus-capture.ts";
import { digest, sourceDigest } from "../corpus-evidence.ts";
import { readSourceSnapshot, verifySourceSnapshot } from "../corpus-snapshot.ts";
import { interactionHost } from "./host.ts";
import { interactionPlan } from "./scenarios.ts";
import { interactionTests } from "./ui-tests.ts";
import { interactionProject, interactionScheme } from "./xcode-project.ts";
import type { InteractionManifest, InteractionPlan } from "./types.ts";
import { captureBrowserOracle, freezeBrowserExpectations } from "./browser-oracle.ts";

export interface PrepareInteractionsOptions { outputRoot: string; width?: number; theme?: "light" | "dark" }
/** Preparation captures frozen input and writes a host; it never boots, installs or launches a simulator. */
export async function prepareInteractions(fixtures: readonly CorpusFixture[], options: PrepareInteractionsOptions): Promise<string> {
  if (!fixtures.length || new Set(fixtures.map(fixture => fixture.id)).size !== fixtures.length) throw new Error("Interaction fixtures must be nonempty and unique");
  const width = options.width ?? 390, theme = options.theme ?? "light";
  if (!Number.isInteger(width) || width < 240 || width > 768) throw new Error("Interaction width must be an integer 240–768");
  const cwd = join(import.meta.dir, "../../.."), snapshot = await readSourceSnapshot(cwd);
  if (snapshot) await verifySourceSnapshot(cwd);
  const sourceHash = await sourceDigest(cwd), preparedAt = new Date().toISOString();
  const directory = join(options.outputRoot, `${preparedAt.replaceAll(/[:.]/g, "-")}-${digest(fixtures.map(fixture => fixture.id).join("\n")).slice(0, 10)}`);
  await mkdir(options.outputRoot, { recursive: true }); await mkdir(directory, { recursive: false });
  const browser = new CorpusCapture();
  try {
    const captures: Capture[] = [];
    for (const fixture of fixtures) {
      const capture = await browser.capture(fixture, width, theme); captures.push(capture);
      const path = join(directory, "Inputs", fixture.id); await mkdir(path, { recursive: true });
      await writeFile(join(path, "source.html"), fixture.html); await writeFile(join(path, "source.css"), fixture.css);
      await writeFile(join(path, "layout.json"), JSON.stringify(capture.layout)); await writeFile(join(path, "chrome.png"), capture.png);
    }
    const resources = await corpusFonts(captures, join(directory, "FontWork"));
    let plans = captures.map((capture, index) => {
      const controls: ControlNode[] = [];
      walk(inferScreen(capture.layout, fixtures[index]!.name, resources).root, node => { if (node.kind === "control") controls.push(node); });
      return interactionPlan(fixtures[index]!, controls, width, theme);
    });
    const oracleHashes: Record<string, string> = {}, browserOracles: NonNullable<InteractionManifest["browserOracles"]> = [];
    const frozenPlans: InteractionPlan[] = [];
    for (const [index, plan] of plans.entries()) {
      const prefix = `BrowserOracle/${plan.fixture}`, captured = await captureBrowserOracle(fixtures[index]!, plan, join(directory, prefix));
      frozenPlans.push(freezeBrowserExpectations(plan, captured.oracle));
      Object.assign(oracleHashes, Object.fromEntries(Object.entries(captured.hashes).map(([path, hash]) => [`${prefix}/${path}`, hash])));
      browserOracles.push({ fixture: plan.fixture, path: `${prefix}/oracle.json`, hash: captured.hashes["oracle.json"]! });
    }
    plans = frozenPlans;
    const bundle = compileLayouts(captures.map((capture, index) => ({ ...resources, layout: capture.layout, name: plans[index]!.viewName, mode: "app" })));
    const generated: Record<string, string | Uint8Array> = {};
    const sources: string[] = [];
    for (const [path, text] of Object.entries(bundle.files)) if (path.endsWith(".swift")) {
      generated[`App/Generated/${path}`] = text; sources.push(`App/Generated/${path}`);
    }
    for (const [path, bytes] of Object.entries(bundle.assets)) generated[`App/Resources/${path}`] = bytes;
    generated["App/Host.swift"] = interactionHost(plans, !!bundle.files["Font+Markswift.swift"]); sources.push("App/Host.swift");
    generated["UITests/CorpusInteractionUITests.swift"] = interactionTests(plans);
    const resourcePaths = [...new Set(Object.keys(bundle.assets).map(path => `App/Resources/${path.split("/")[0]!}`))].sort();
    const project = interactionProject(sources, resourcePaths);
    generated["CorpusInteractions.xcodeproj/project.pbxproj"] = project.pbxproj;
    generated[`CorpusInteractions.xcodeproj/xcshareddata/xcschemes/${interactionScheme}.xcscheme`] = project.scheme;
    for (const [path, contents] of Object.entries(generated)) {
      await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), contents);
    }
    const manifest: InteractionManifest = {
      version: 1, preparedAt, sourceHash, swiftHash: digest(JSON.stringify(bundle.files)),
      ...(snapshot ? { sourceSnapshot: { directory: cwd, sourceHash: snapshot.sourceHash, dependencyHash: snapshot.dependencyHash } } : {}),
      generatedFiles: { ...oracleHashes, ...Object.fromEntries(Object.entries(generated).map(([path, contents]) => [path, digest(contents)])) }, browserOracles,
      fixtures: fixtures.map((fixture, index) => ({ fixture: fixture.id, sourceHash: digest(fixture.html + "\n" + fixture.css),
        layoutHash: digest(JSON.stringify(captures[index]!.layout)), diagnostics: bundle.views[index]!.diagnostics })),
      plans, status: "prepared", results: plans.map(plan => ({ fixture: plan.fixture, testName: plan.testName, status: "not-executed" })), passedStatefulFamilies: 0,
    };
    const after = await sourceDigest(cwd);
    if (snapshot) await verifySourceSnapshot(cwd);
    if (after !== sourceHash) manifest.preparationSourceChanged = after;
    await writeFile(join(directory, "prepared.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    return directory;
  } finally { await browser.stop(); }
}
