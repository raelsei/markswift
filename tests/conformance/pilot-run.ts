/** Local visual pilot: capture browser references with pinned Chromium, compile both modes, render natively and score. */
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { serveDir } from "../../src/input/server.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { registrationSwift } from "../../src/fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { ensureSimulator, renderIos, renderMac } from "../../tools/verify/native.ts";
import { compare, regionMismatch } from "../../tools/verify/compare.ts";
import type { ConversionResult } from "../../src/index.ts";
import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";
import { buildMatrix, loadFixtureSet, loadPilot, type PilotEntry, type RunCase } from "./pilot.ts";
import { browserTextMetrics, imageInkMetrics } from "./text-metrics.ts";

const USAGE = `usage: bun tests/conformance/pilot-run.ts [--all] [--only <id>] [--group text] [--renderer none|mac|ios] [--out <dir>]
  --all       every fixture under tests/conformance/fixtures/<domain>/ (pilot.json cases keep their expectations)
  --only      one case id
  --group     text: only cases with expected text
  --renderer  mac (default): macOS ImageRenderer, the per-PR gate;
              ios: iOS Simulator (UIHostingController + drawHierarchy, batched builds), the release gate;
              none: capture, compile and typecheck only, no render or comparison
  --out       fresh output directory (default tests/conformance/out/<timestamp>)
Captures use Playwright's pinned Chromium: ./node_modules/.bin/playwright-core install --no-shell chromium`;
type Renderer = "none" | "mac" | "ios";
type RunEntry = {
  key: string;
  caseId: string;
  viewportWidth: number;
  theme: string;
  mode: string;
  size?: { w: number; h: number };
  loadedFonts?: number;
  warnings?: number;
  diagnostics?: number;
  typecheck?: boolean;
  ssim?: number;
  mismatch?: number;
};
/** Provenance written to `run.json` and into every `compare.json`; `simulatorUdid` stays in `run.json` only. */
interface RunEnvironment {
  sourceRevision: string;
  fixtureHashes: Record<string, string>;
  harnessHash: string;
  chrome: string;
  xcode: string;
  renderer: string;
  simulatorUdid: string | null;
  capturedAt: string;
  dpr: number;
  viewportHeight: number;
  rootWidthOverride: string;
}
interface RunReport {
  expected: number;
  completed: number;
  errors: string[];
  environment: RunEnvironment;
  entries: RunEntry[];
}
/** One typechecked capture waiting for its native render and score. */
interface Job {
  entry: PilotEntry;
  item: RunCase;
  dir: string;
  layout: LayoutDoc;
  textMetrics: ReturnType<typeof browserTextMetrics> | undefined;
  result: RunEntry;
}
// ponytail: fixed batch of 48 captures per app build (6 cases × 8 captures); tune if one batch build exceeds ~3 min.
const IOS_BATCH = 48;
const artifactFiles = [
  "browser.png",
  "native.png",
  "diff.png",
  "layout.json",
  "diagnostics.json",
  "warnings.json",
  "typecheck.json",
] as const;
const harnessFiles = [
  "tests/conformance/pilot-run.ts",
  "tests/conformance/pilot.ts",
  "tests/conformance/pilot.json",
  "tests/conformance/text-metrics.ts",
  "tools/verify/native.ts",
  "tools/verify/native-template.ts",
  "tools/verify/process.ts",
  "tools/verify/typecheck.ts",
  "tools/verify/compare.ts",
];

async function hashFile(path: string) {
  return createHash("sha256")
    .update(Buffer.from(await Bun.file(path).arrayBuffer()))
    .digest("hex");
}
export function assertCleanSource(status: string) {
  if (status.trim())
    throw new Error(
      `converter source is dirty; commit or restore src/ before a named-revision pilot: ${status.trim()}`,
    );
}

async function outputOf(command: string[]): Promise<string> {
  const run = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  if ((await run.exited) !== 0) throw new Error(`${command[0]} failed: ${stderr.trim()}`);
  return stdout.trim();
}
async function environment(cases: RunCase[], renderer: Renderer, chrome: string): Promise<RunEnvironment> {
  const [sourceRevision, sourceStatus, xcode] = await Promise.all([
    outputOf(["git", "rev-parse", "HEAD"]),
    outputOf(["git", "status", "--porcelain", "--", "src"]),
    outputOf(["xcodebuild", "-version"]),
  ]);
  assertCleanSource(sourceStatus);
  const selected = renderer === "ios" ? await ensureSimulator() : null;
  const fixtureHashes = Object.fromEntries(
    await Promise.all(
      cases.map(async (item) => [item.id, await hashFile(join(import.meta.dir, "fixtures", item.fixture))]),
    ),
  );
  const harness = createHash("sha256");
  for (const file of harnessFiles) {
    harness
      .update(file)
      .update("\0")
      .update(Buffer.from(await Bun.file(resolve(import.meta.dir, "../..", file)).arrayBuffer()))
      .update("\0");
  }
  // The UDID stays out of `renderer` so runs on different machines with the same device and runtime compare.
  const rendererName = selected
    ? `${selected.name} ${selected.runtime}`
    : renderer === "mac"
      ? `macOS ${await outputOf(["sw_vers", "-productVersion"])} ImageRenderer`
      : "none";
  return {
    sourceRevision,
    fixtureHashes,
    harnessHash: harness.digest("hex"),
    chrome,
    xcode,
    renderer: rendererName,
    simulatorUdid: selected?.udid ?? null,
    capturedAt: new Date().toISOString(),
    dpr: 2,
    viewportHeight: 2000,
    rootWidthOverride: "[data-markswift-root] { width:100% !important }",
  };
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
  for (const font of captured.fontFiles) await Bun.write(join(dir, font.file), font.bytes);
  return dir;
}

async function run() {
  const flags = parseArgs({
    args: process.argv.slice(2),
    options: {
      all: { type: "boolean" },
      help: { type: "boolean" },
      only: { type: "string" },
      group: { type: "string" },
      renderer: { type: "string" },
      out: { type: "string" },
    },
  }).values;
  if (flags.help) return console.log(USAGE);
  const { only, group } = flags;
  const out = resolve(flags.out ?? join(import.meta.dir, "out", new Date().toISOString().replace(/[:.]/g, "-")));
  const renderer = (flags.renderer ?? "mac") as Renderer;
  if (!["none", "mac", "ios"].includes(renderer)) throw new Error(`unknown renderer: ${renderer}\n${USAGE}`);
  const pilot = await loadPilot();
  const cases = flags.all ? await loadFixtureSet(pilot) : pilot;
  if (only && !cases.some((item) => item.id === only)) throw new Error(`unknown pilot case: ${only}`);
  if (group && group !== "text") throw new Error(`unknown pilot group: ${group}`);
  const selected = only
    ? cases.filter((item) => item.id === only)
    : group === "text"
      ? cases.filter((item) => item.expectedText !== undefined)
      : cases;
  const matrix = buildMatrix(selected);
  await mkdir(dirname(out), { recursive: true });
  try {
    await mkdir(out);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`output already exists: ${out}; choose a fresh --out directory`);
    throw error;
  }
  const server = await serveDir(join(import.meta.dir, "fixtures"));
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
    console.log(
      `expected ${matrix.length} ${renderer === "none" ? "capture/typecheck" : `${env.renderer} comparison`} outputs`,
    );
    /** Score a rendered capture: text ink, compare, anchors, artifact hashes, `compare.json`, status line. */
    const finish = async ({ entry, item, dir, layout, textMetrics, result }: Job) => {
      try {
        const browserPng = join(dir, "browser.png"),
          nativePng = join(dir, "native.png");
        if (textMetrics) {
          textMetrics.nativeInk = await imageInkMetrics(nativePng, layout.dpr);
          await Bun.write(join(dir, "text.json"), JSON.stringify(textMetrics, null, 2));
        }
        const score = await compare(browserPng, nativePng, join(dir, "diff.png"), layout.dpr);
        result.ssim = score.ssim;
        result.mismatch = score.mismatch;
        const anchors: Array<{ id: string; mismatch: number }> = [];
        for (const id of item.anchors ?? []) {
          const node = findNode(layout.root, id);
          if (!node) throw new Error(`anchor ${id} not found`);
          anchors.push({
            id,
            mismatch: await regionMismatch(browserPng, nativePng, node.bounds, layout.dpr),
          });
        }
        const artifactHashes = Object.fromEntries(
          await Promise.all(artifactFiles.map(async (file) => [file, await hashFile(join(dir, file))])),
        );
        if (textMetrics) artifactHashes["text.json"] = await hashFile(join(dir, "text.json"));
        await Bun.write(
          join(dir, "compare.json"),
          JSON.stringify(
            {
              ...score,
              ...result,
              fixture: item.fixture,
              anchors,
              sourceRevision: env.sourceRevision,
              fixtureHash: env.fixtureHashes[item.id],
              harnessHash: env.harnessHash,
              artifactHashes,
              capturedAt: env.capturedAt,
              chrome: env.chrome,
              xcode: env.xcode,
              renderer: env.renderer,
              dpr: env.dpr,
              viewportHeight: env.viewportHeight,
              rootWidthOverride: env.rootWidthOverride,
            },
            null,
            2,
          ),
        );
        // Anchor values for review; the gate's threshold (`anchorMaxMismatch`) lives in the policy.
        const status = `SSIM ${score.ssim.toFixed(4)} mismatch ${score.mismatch.toFixed(4)}${anchors.map((a) => ` ${a.id} ${a.mismatch.toFixed(3)}`).join("")}`;
        report!.completed++;
        console.log(`${entry.key}: ${status} (${report!.completed}/${report!.expected})`);
      } catch (error) {
        report!.errors.push(`${entry.key}: ${String(error)}`);
        console.error(`${entry.key}: ${String(error)}`);
      }
    };
    const pending: Array<Job & { conversion: ConversionResult }> = [];
    /** Render every pending iOS capture in one app build and launch, then score each. */
    const flush = async () => {
      const jobs = pending.splice(0);
      if (!jobs.length) return;
      const errors = await renderIos(
        jobs.map((j) => ({ result: j.conversion, output: join(j.dir, "native.png") })),
        join(out, "_ios-work"),
        env.simulatorUdid!,
      ).catch((error) => new Map(jobs.map((j) => [join(j.dir, "native.png"), String(error)])));
      for (const j of jobs) {
        const failed = errors.get(join(j.dir, "native.png"));
        if (failed) {
          report!.errors.push(`${j.entry.key}: iOS render failed: ${failed}`);
          console.error(`${j.entry.key}: iOS render failed: ${failed}`);
        } else await finish(j);
      }
    };
    for (const item of selected) {
      for (const width of [320, 390]) {
        for (const theme of item.themes) {
          const pair = matrix.filter(
            (entry) => entry.case.id === item.id && entry.width === width && entry.theme === theme,
          );
          let captured: Awaited<ReturnType<BrowserCapture["capture"]>>;
          try {
            captured = await browsers.get(width)!.capture(
              {
                screen: item.id,
                theme,
                url: `${server.origin}/${item.fixture}`,
                root: "[data-markswift-root]",
                screenshot: true,
                async prepare(page) {
                  const style = await page.addStyleTag({
                    content: "[data-markswift-root] { width: 100% !important; }",
                  });
                  await style.evaluate((element) => (element as Element).setAttribute("data-markswift-harness", ""));
                },
              },
              htmlIdentity,
              `pilot:${item.fixture}`,
            );
          } catch (error) {
            for (const entry of pair) report.errors.push(`${entry.key}: capture failed: ${String(error)}`);
            continue;
          }
          for (const entry of pair) {
            const result: RunEntry = {
              key: entry.key,
              caseId: item.id,
              viewportWidth: width,
              theme,
              mode: entry.mode,
              size: captured.layout.size,
              loadedFonts: captured.layout.fonts.filter((face) => face.loaded).length,
              warnings: captured.warnings.length,
            };
            report.entries.push(result);
            try {
              const dir = await saveSource(entry, captured, out);
              const name =
                "Pilot" +
                entry.key
                  .split("-")
                  .filter(Boolean)
                  .map((part) => part[0]!.toUpperCase() + part.slice(1))
                  .join("");
              const swiftDir = join(dir, "swift");
              const fonts = await packageFonts(
                captured.layout.fonts,
                new Map(captured.fontFiles.map((f) => [f.file, f.bytes])),
              );
              const compiled = compileLayout(captured.layout, {
                name,
                mode: entry.mode,
                bundledFamilies: bundledFamilies(fonts),
                fontMetrics: metricsForFonts(fonts),
              });
              const assets: Record<string, Uint8Array> = { ...compiled.assets, ...fonts.assets };
              if (fonts.faces.length) {
                compiled.files[`${name}+Fonts.swift`] = registrationSwift(fonts.faces, name);
                compiled.files[`${name}+UIAppFonts.plist.fragment`] = fonts.plist;
              }
              result.diagnostics = compiled.diagnostics.length;
              await Bun.write(join(dir, "diagnostics.json"), JSON.stringify(compiled.diagnostics, null, 2));
              await mkdir(swiftDir, { recursive: true });
              for (const [file, content] of Object.entries(compiled.files))
                await Bun.write(join(swiftDir, file), content);
              const textMetrics =
                item.expectedText === undefined
                  ? undefined
                  : browserTextMetrics(captured.layout.root, item.expectedText);
              if (textMetrics) {
                textMetrics.browserInk = await imageInkMetrics(join(dir, "browser.png"), captured.layout.dpr);
                textMetrics.fonts = {
                  faces: fonts.faces,
                  notes: fonts.notes,
                  sources: await Promise.all(
                    captured.fontFiles.map(async (font) => ({
                      name: font.file.replace(/^_fonts\//, ""),
                      sha256: createHash("sha256").update(font.bytes).digest("hex"),
                    })),
                  ),
                };
                textMetrics.expectedLines = item.expectedLines?.[String(width) as "320" | "390"] ?? null;
                if (!textMetrics.contentMatches)
                  throw new Error(
                    `captured text content differs from manifest: ${JSON.stringify(textMetrics.content)}`,
                  );
                if (
                  textMetrics.expectedLines !== textMetrics.lineCount ||
                  textMetrics.browserInk.lineCount !== textMetrics.lineCount
                ) {
                  throw new Error(
                    `browser text line count ${textMetrics.lineCount}/${textMetrics.browserInk.lineCount} differs from ${textMetrics.expectedLines}`,
                  );
                }
                if (item.id !== "text-missing-font" && captured.warnings.length)
                  throw new Error(`unexpected text resource warnings: ${captured.warnings.join("; ")}`);
                await Bun.write(join(dir, "text.json"), JSON.stringify(textMetrics, null, 2));
              }
              const check = await typecheck(swiftDir);
              result.typecheck = check.ok;
              await Bun.write(join(dir, "typecheck.json"), JSON.stringify(check, null, 2));
              if (!check.ok) throw new Error(`Swift typecheck failed: ${check.output.slice(0, 500)}`);
              const job: Job = { entry, item, dir, layout: captured.layout, textMetrics, result };
              if (renderer === "none") {
                report.completed++;
                console.log(`${entry.key}: typed (${report.completed}/${report.expected})`);
              } else {
                const conversion = {
                  ...compiled,
                  layout: captured.layout,
                  assets,
                  warnings: [...captured.warnings, ...fonts.notes],
                };
                if (renderer === "mac") {
                  await renderMac(conversion, join(out, "_mac-work"), join(dir, "native.png"));
                  await finish(job);
                } else {
                  pending.push({ ...job, conversion });
                  if (pending.length === IOS_BATCH) await flush();
                }
              }
            } catch (error) {
              report.errors.push(`${entry.key}: ${String(error)}`);
              console.error(`${entry.key}: ${String(error)}`);
            }
          }
        }
      }
    }
    await flush();
  } finally {
    await Promise.all([...browsers.values()].map((browser) => browser.stop()));
    server.stop();
    // A failure before the environment is known (no browser, dirty src/, no simulator) leaves no run.json.
    if (report) await Bun.write(join(out, "run.json"), JSON.stringify(report, null, 2));
  }
  if (report!.completed !== report!.expected || report!.errors.length)
    throw new Error(`pilot incomplete: ${report!.completed}/${report!.expected}; ${report!.errors.join("; ")}`);
}

if (import.meta.main)
  run().catch((error) => {
    // Bad flags (unknown, missing value, stray positional) are usage errors: print usage and exit 2.
    const usage = String((error as NodeJS.ErrnoException).code ?? "").startsWith("ERR_PARSE_ARGS");
    console.error(error instanceof Error ? error.message : String(error));
    if (usage) console.error(USAGE);
    process.exitCode = usage ? 2 : 1;
  });
