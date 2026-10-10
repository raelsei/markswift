/** Local visual pilot: capture browser references, compile both modes, optionally render iOS. */
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { serveDir } from "../../src/browser/server.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { renderNative, selectSimulator, type SimulatorInventory } from "../../tools/verify/native.ts";
import { compare } from "../../tools/verify/compare.ts";
import { buildMatrix, loadFixtureSet, loadPilot, type PilotEntry, type RunCase } from "./pilot.ts";
import { browserTextMetrics, imageInkMetrics } from "./text-metrics.ts";

const USAGE = `usage: bun tests/conformance/pilot-run.ts [--all] [--only <id>] [--group text] [--no-sim] [--out <dir>]
  --all      every fixture under tests/conformance/fixtures/<domain>/ (pilot.json cases keep their expectations)
  --only     one case id
  --group    text: only cases with expected text
  --no-sim   capture, compile and typecheck only; skip the iOS render and comparison
  --out      fresh output directory (default tests/conformance/out/<timestamp>)`;
type RunEntry = { key: string; caseId: string; viewportWidth: number; theme: string; mode: string; size?: { w: number; h: number }; loadedFonts?: number; warnings?: number; diagnostics?: number; typecheck?: boolean; ssim?: number; mismatch?: number };
const artifactFiles = ["browser.png", "ios.png", "diff.png", "layout.json", "diagnostics.json", "warnings.json", "typecheck.json"] as const;
const harnessFiles = ["tests/conformance/pilot-run.ts", "tests/conformance/pilot.ts", "tests/conformance/pilot.json", "tests/conformance/text-metrics.ts", "tools/verify/native.ts", "tools/verify/native-template.ts", "tools/verify/process.ts", "tools/verify/typecheck.ts", "tools/verify/compare.ts"];

async function hashFile(path: string) {
  return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex");
}
export function assertCleanSource(status: string) {
  if (status.trim()) throw new Error(`converter source is dirty; commit or restore src/ before a named-revision pilot: ${status.trim()}`);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
async function outputOf(command: string[]): Promise<string> {
  const run = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  if (await run.exited !== 0) throw new Error(`${command[0]} failed: ${stderr.trim()}`);
  return stdout.trim();
}
async function environment(cases: RunCase[], noSim: boolean) {
  const [sourceRevision, sourceStatus, xcode, simulators, chrome] = await Promise.all([
    outputOf(["git", "rev-parse", "HEAD"]),
    outputOf(["git", "status", "--porcelain", "--", "src"]),
    outputOf(["xcodebuild", "-version"]),
    outputOf(["xcrun", "simctl", "list", "devices", "available", "-j"]),
    outputOf(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--version"]),
  ]);
  assertCleanSource(sourceStatus);
  const inventory = JSON.parse(simulators) as SimulatorInventory;
  let selected: ReturnType<typeof selectSimulator> | null = null;
  try { selected = selectSimulator(inventory, process.env.MARKSWIFT_SIMULATOR); }
  catch (error) { if (!noSim) throw error; }
  const fixtureHashes = Object.fromEntries(await Promise.all(cases.map(async item => [item.id, await hashFile(join(import.meta.dir, "fixtures", item.fixture))])));
  const harness = createHash("sha256");
  for (const file of harnessFiles) {
    harness.update(file).update("\0").update(Buffer.from(await Bun.file(resolve(import.meta.dir, "../..", file)).arrayBuffer())).update("\0");
  }
  return { sourceRevision, fixtureHashes, harnessHash: harness.digest("hex"), chrome, xcode,
    simulator: selected ? `${selected.name} ${selected.runtime} (${selected.udid})` : "none", simulatorUdid: selected?.udid ?? null,
    capturedAt: new Date().toISOString(), dpr: 2, viewportHeight: 2000, rootWidthOverride: "[data-markswift-root] { width:100% !important }" };
}
async function saveSource(entry: PilotEntry, captured: Awaited<ReturnType<BrowserCapture["capture"]>>, out: string) {
  const dir = join(out, entry.key);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    Bun.write(join(dir, "browser.png"), captured.png!),
    Bun.write(join(dir, "layout.json"), JSON.stringify(captured.layout, null, 2)),
    Bun.write(join(dir, "warnings.json"), JSON.stringify(captured.warnings, null, 2)),
  ]);
  for (const font of captured.fontFiles) await Bun.write(join(dir, "_fonts", font.name), font.bytes);
  return dir;
}

async function run() {
  if (process.argv.includes("--help")) return console.log(USAGE);
  const only = argument("--only");
  const group = argument("--group");
  const out = resolve(argument("--out") ?? join(import.meta.dir, "out", new Date().toISOString().replace(/[:.]/g, "-")));
  const noSim = process.argv.includes("--no-sim");
  const pilot = await loadPilot();
  const cases = process.argv.includes("--all") ? await loadFixtureSet(pilot) : pilot;
  if (only && !cases.some(item => item.id === only)) throw new Error(`unknown pilot case: ${only}`);
  if (group && group !== "text") throw new Error(`unknown pilot group: ${group}`);
  const selected = only ? cases.filter(item => item.id === only) : group === "text" ? cases.filter(item => item.expectedText !== undefined) : cases;
  const matrix = buildMatrix(selected);
  await mkdir(dirname(out), { recursive: true });
  try { await mkdir(out); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`output already exists: ${out}; choose a fresh --out directory`);
    throw error;
  }
  const env = await environment(cases, noSim);
  const report: { expected: number; completed: number; errors: string[]; environment: Awaited<ReturnType<typeof environment>>; entries: RunEntry[] } = {
    expected: matrix.length, completed: 0, errors: [], environment: env, entries: [],
  };
  console.log(`expected ${matrix.length} ${noSim ? "capture/typecheck" : "native comparison"} outputs`);
  const server = serveDir(join(import.meta.dir, "fixtures"));
  const browsers = new Map<number, BrowserCapture>();
  try {
    for (const width of [320, 390]) {
      const browser = new BrowserCapture({ dpr: 2, viewport: { width, height: 2000 } });
      await browser.start();
      browsers.set(width, browser);
    }
    for (const item of selected) {
      for (const width of [320, 390]) {
        for (const theme of item.themes) {
          const pair = matrix.filter(entry => entry.case.id === item.id && entry.width === width && entry.theme === theme);
          let captured: Awaited<ReturnType<BrowserCapture["capture"]>>;
          try {
            captured = await browsers.get(width)!.capture({
              screen: item.id, theme, url: `${server.origin}/${item.fixture}`, root: "[data-markswift-root]", screenshot: true,
              async prepare(page) {
                const style = await page.addStyleTag({ content: "[data-markswift-root] { width: 100% !important; }" });
                await style.evaluate(element => (element as Element).setAttribute("data-markswift-harness", ""));
              },
            }, htmlIdentity, `pilot:${item.fixture}`);
          } catch (error) {
            for (const entry of pair) report.errors.push(`${entry.key}: capture failed: ${String(error)}`);
            continue;
          }
          for (const entry of pair) {
            const result: RunEntry = { key: entry.key, caseId: item.id, viewportWidth: width, theme, mode: entry.mode,
              size: captured.layout.size, loadedFonts: captured.layout.fonts.filter(face => face.loaded).length,
              warnings: captured.warnings.length };
            report.entries.push(result);
            try {
              const dir = await saveSource(entry, captured, out);
              const name = "Pilot" + item.id.split("-").filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join("");
              const swiftDir = join(dir, "swift");
              const fonts = await packageFonts(captured.layout.fonts, swiftDir, dir);
              const compiled = compileLayout(captured.layout, {
                name, mode: entry.mode, bundledFamilies: bundledFamilies(fonts), fontMetrics: metricsForFonts(fonts),
              });
              const assets: Record<string, Uint8Array> = {};
              for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await Bun.file(join(swiftDir, "Fonts", face.file)).arrayBuffer());
              if (fonts.faces.length) {
                compiled.files["Font+Markswift.swift"] = fonts.swift;
                compiled.files["UIAppFonts.plist.fragment"] = fonts.plist;
              }
              result.diagnostics = compiled.diagnostics.length;
              await Bun.write(join(dir, "diagnostics.json"), JSON.stringify(compiled.diagnostics, null, 2));
              await mkdir(swiftDir, { recursive: true });
              for (const [file, content] of Object.entries(compiled.files)) await Bun.write(join(swiftDir, file), content);
              const textMetrics = item.expectedText === undefined ? undefined : browserTextMetrics(captured.layout.root, item.expectedText);
              if (textMetrics) {
                textMetrics.browserInk = await imageInkMetrics(join(dir, "browser.png"), captured.layout.dpr);
                textMetrics.fonts = { faces: fonts.faces, notes: fonts.notes,
                  sources: await Promise.all(captured.fontFiles.map(async font => ({ name: font.name, sha256: createHash("sha256").update(font.bytes).digest("hex") }))) };
                textMetrics.expectedLines = item.expectedLines?.[String(width) as "320" | "390"] ?? null;
                if (!textMetrics.contentMatches) throw new Error(`captured text content differs from manifest: ${JSON.stringify(textMetrics.content)}`);
                if (textMetrics.expectedLines !== textMetrics.lineCount || textMetrics.browserInk.lineCount !== textMetrics.lineCount) {
                  throw new Error(`browser text line count ${textMetrics.lineCount}/${textMetrics.browserInk.lineCount} differs from ${textMetrics.expectedLines}`);
                }
                if (item.id !== "text-missing-font" && captured.warnings.length) throw new Error(`unexpected text resource warnings: ${captured.warnings.join("; ")}`);
                await Bun.write(join(dir, "text.json"), JSON.stringify(textMetrics, null, 2));
              }
              const check = await typecheck(swiftDir);
              result.typecheck = check.ok;
              await Bun.write(join(dir, "typecheck.json"), JSON.stringify(check, null, 2));
              if (!check.ok) throw new Error(`Swift typecheck failed: ${check.output.slice(0, 500)}`);
              if (!noSim) {
                await renderNative({ ...compiled, layout: captured.layout, assets, warnings: [...captured.warnings, ...fonts.notes] }, join(out, "_native-work"), join(dir, "ios.png"), () => {}, env.simulatorUdid ?? undefined);
                if (textMetrics) {
                  textMetrics.nativeInk = await imageInkMetrics(join(dir, "ios.png"), captured.layout.dpr);
                  await Bun.write(join(dir, "text.json"), JSON.stringify(textMetrics, null, 2));
                }
                const score = await compare(join(dir, "browser.png"), join(dir, "ios.png"), join(dir, "diff.png"));
                result.ssim = score.ssim;
                result.mismatch = score.mismatch;
                const artifactHashes = Object.fromEntries(await Promise.all(artifactFiles.map(async file => [file, await hashFile(join(dir, file))])));
                if (textMetrics) artifactHashes["text.json"] = await hashFile(join(dir, "text.json"));
                await Bun.write(join(dir, "compare.json"), JSON.stringify({ ...score, ...result, sourceRevision: env.sourceRevision,
                  fixtureHash: env.fixtureHashes[item.id], harnessHash: env.harnessHash, artifactHashes,
                  capturedAt: env.capturedAt, chrome: env.chrome, xcode: env.xcode, simulator: env.simulator,
                  dpr: env.dpr, viewportHeight: env.viewportHeight, rootWidthOverride: env.rootWidthOverride }, null, 2));
              }
              report.completed++;
              console.log(`${entry.key}: ${noSim ? "typed" : `SSIM ${result.ssim?.toFixed(4)}`} (${report.completed}/${report.expected})`);
            } catch (error) {
              report.errors.push(`${entry.key}: ${String(error)}`);
              console.error(`${entry.key}: ${String(error)}`);
            }
          }
        }
      }
    }
  } finally {
    await Promise.all([...browsers.values()].map(browser => browser.stop()));
    server.stop();
    await Bun.write(join(out, "run.json"), JSON.stringify(report, null, 2));
  }
  if (report.completed !== report.expected || report.errors.length) throw new Error(`pilot incomplete: ${report.completed}/${report.expected}; ${report.errors.join("; ")}`);
}

if (import.meta.main) run().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
