/** Local visual pilot: capture browser references with pinned Chromium, compile both modes, render natively and score. */
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { serveDir } from "../../src/browser/server.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { registrationSwift } from "../../src/fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { renderMac, renderNative, selectSimulator, type SimulatorInventory } from "../../tools/verify/native.ts";
import { compare, regionMismatch } from "../../tools/verify/compare.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { buildMatrix, loadFixtureSet, loadPilot, type PilotEntry, type RunCase } from "./pilot.ts";
import { browserTextMetrics, imageInkMetrics } from "./text-metrics.ts";

const USAGE = `usage: bun tests/conformance/pilot-run.ts [--all] [--only <id>] [--group text] [--renderer none|mac|ios] [--out <dir>]
  --all       every fixture under tests/conformance/fixtures/<domain>/ (pilot.json cases keep their expectations)
  --only      one case id
  --group     text: only cases with expected text
  --renderer  mac (default): macOS ImageRenderer, the per-PR gate; ios: iOS Simulator, the release gate;
              none: capture, compile and typecheck only, no render or comparison
  --out       fresh output directory (default tests/conformance/out/<timestamp>)
Captures use Playwright's pinned Chromium: ./node_modules/.bin/playwright-core install --no-shell chromium`;
type Renderer = "none" | "mac" | "ios";
type RunEntry = { key: string; caseId: string; viewportWidth: number; theme: string; mode: string; size?: { w: number; h: number }; loadedFonts?: number; warnings?: number; diagnostics?: number; typecheck?: boolean; ssim?: number; mismatch?: number };
/** Provenance written to `run.json` and into every `compare.json`; `simulatorUdid` stays in `run.json` only. */
interface RunEnvironment {
  sourceRevision: string; fixtureHashes: Record<string, string>; harnessHash: string; chrome: string; xcode: string;
  renderer: string; simulatorUdid: string | null; capturedAt: string; dpr: number; viewportHeight: number; rootWidthOverride: string;
}
interface RunReport { expected: number; completed: number; errors: string[]; environment: RunEnvironment; entries: RunEntry[] }
const artifactFiles = ["browser.png", "native.png", "diff.png", "layout.json", "diagnostics.json", "warnings.json", "typecheck.json"] as const;
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
async function environment(cases: RunCase[], renderer: Renderer, chrome: string): Promise<RunEnvironment> {
  const [sourceRevision, sourceStatus, xcode] = await Promise.all([
    outputOf(["git", "rev-parse", "HEAD"]),
    outputOf(["git", "status", "--porcelain", "--", "src"]),
    outputOf(["xcodebuild", "-version"]),
  ]);
  assertCleanSource(sourceStatus);
  const selected = renderer === "ios"
    ? selectSimulator(JSON.parse(await outputOf(["xcrun", "simctl", "list", "devices", "available", "-j"])) as SimulatorInventory, process.env.MARKSWIFT_SIMULATOR)
    : null;
  const fixtureHashes = Object.fromEntries(await Promise.all(cases.map(async item => [item.id, await hashFile(join(import.meta.dir, "fixtures", item.fixture))])));
  const harness = createHash("sha256");
  for (const file of harnessFiles) {
    harness.update(file).update("\0").update(Buffer.from(await Bun.file(resolve(import.meta.dir, "../..", file)).arrayBuffer())).update("\0");
  }
  // The UDID stays out of `renderer` so runs on different machines with the same device and runtime compare.
  const rendererName = selected ? `${selected.name} ${selected.runtime}`
    : renderer === "mac" ? `macOS ${await outputOf(["sw_vers", "-productVersion"])} ImageRenderer` : "none";
  return { sourceRevision, fixtureHashes, harnessHash: harness.digest("hex"), chrome, xcode,
    renderer: rendererName, simulatorUdid: selected?.udid ?? null,
    capturedAt: new Date().toISOString(), dpr: 2, viewportHeight: 2000, rootWidthOverride: "[data-markswift-root] { width:100% !important }" };
}

function findNode(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return undefined;
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
  const renderer = (argument("--renderer") ?? "mac") as Renderer;
  if (!["none", "mac", "ios"].includes(renderer)) throw new Error(`unknown renderer: ${renderer}\n${USAGE}`);
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
  const server = serveDir(join(import.meta.dir, "fixtures"));
  const browsers = new Map<number, BrowserCapture>();
  let report: RunReport | undefined;
  try {
    for (const width of [320, 390]) {
      // Lockfile-pinned Chromium, never the auto-updating Chrome channel, so references reproduce on any machine.
      const browser = new BrowserCapture({ dpr: 2, viewport: { width, height: 2000 }, channel: "chromium" });
      await browser.start();
      browsers.set(width, browser);
    }
    const env = await environment(cases, renderer, `Chromium ${browsers.get(320)!.version}`);
    report = { expected: matrix.length, completed: 0, errors: [], environment: env, entries: [] };
    console.log(`expected ${matrix.length} ${renderer === "none" ? "capture/typecheck" : `${env.renderer} comparison`} outputs`);
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
              const assets: Record<string, Uint8Array> = { ...compiled.assets };
              for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await Bun.file(join(swiftDir, "Fonts", face.file)).arrayBuffer());
              if (fonts.faces.length) {
                compiled.files[`${name}+Fonts.swift`] = registrationSwift(fonts.faces, name);
                compiled.files[`${name}+UIAppFonts.plist.fragment`] = fonts.plist;
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
              let status = "typed";
              if (renderer !== "none") {
                const browserPng = join(dir, "browser.png"), nativePng = join(dir, "native.png");
                const conversion = { ...compiled, layout: captured.layout, assets, warnings: [...captured.warnings, ...fonts.notes] };
                if (renderer === "mac") await renderMac(conversion, join(out, "_mac-work"), nativePng);
                else await renderNative(conversion, join(out, "_native-work"), nativePng, () => {}, env.simulatorUdid ?? undefined);
                if (textMetrics) {
                  textMetrics.nativeInk = await imageInkMetrics(nativePng, captured.layout.dpr);
                  await Bun.write(join(dir, "text.json"), JSON.stringify(textMetrics, null, 2));
                }
                const score = await compare(browserPng, nativePng, join(dir, "diff.png"), captured.layout.dpr);
                result.ssim = score.ssim;
                result.mismatch = score.mismatch;
                const anchors: Array<{ id: string; mismatch: number }> = [];
                for (const id of item.anchors ?? []) {
                  const node = findNode(captured.layout.root, id);
                  if (!node) throw new Error(`anchor ${id} not found`);
                  anchors.push({ id, mismatch: await regionMismatch(browserPng, nativePng, node.bounds, captured.layout.dpr) });
                }
                const artifactHashes = Object.fromEntries(await Promise.all(artifactFiles.map(async file => [file, await hashFile(join(dir, file))])));
                if (textMetrics) artifactHashes["text.json"] = await hashFile(join(dir, "text.json"));
                await Bun.write(join(dir, "compare.json"), JSON.stringify({ ...score, ...result, fixture: item.fixture, anchors, sourceRevision: env.sourceRevision,
                  fixtureHash: env.fixtureHashes[item.id], harnessHash: env.harnessHash, artifactHashes,
                  capturedAt: env.capturedAt, chrome: env.chrome, xcode: env.xcode, renderer: env.renderer,
                  dpr: env.dpr, viewportHeight: env.viewportHeight, rootWidthOverride: env.rootWidthOverride }, null, 2));
                // Anchor values for review; the gate's threshold (`anchorMaxMismatch`) lives in the policy.
                status = `SSIM ${score.ssim.toFixed(4)} mismatch ${score.mismatch.toFixed(4)}${anchors.map(a => ` ${a.id} ${a.mismatch.toFixed(3)}`).join("")}`;
              }
              report.completed++;
              console.log(`${entry.key}: ${status} (${report.completed}/${report.expected})`);
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
  if (report!.completed !== report!.expected || report!.errors.length) throw new Error(`pilot incomplete: ${report!.completed}/${report!.expected}; ${report!.errors.join("; ")}`);
}

if (import.meta.main) run().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
