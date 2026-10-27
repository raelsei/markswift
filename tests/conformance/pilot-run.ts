/** Local visual pilot: capture browser references with pinned Chromium, compile both modes, render natively and score. */
import { copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { captureLayers, type OpenShots } from "../../src/browser/layers.ts";
import type { CaptureRequest } from "../../src/input/types.ts";
import { serveDir } from "../../src/input/server.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { type BandPlan, planBands } from "../../src/analysis/bands.ts";
import { unionFaces } from "../../src/api/convert.ts";
import { matchesWidth, widthQuery } from "../../src/css/index.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { registrationSwift } from "../../src/fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { ensureSimulator, renderIos, renderMacBatch } from "../../tools/verify/native.ts";
import { command } from "../../tools/verify/process.ts";
import type { RenderResult } from "../../tools/verify/native-template.ts";
import { compare, regionMismatch } from "../../tools/verify/compare.ts";
import type { ConversionResult } from "../../src/index.ts";
import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";
import {
  bpReferences,
  buildMatrix,
  loadFixtureSet,
  loadPilot,
  openKey,
  type PilotEntry,
  type RunCase,
  widthsFor,
} from "./pilot.ts";
import { browserTextMetrics, imageInkMetrics } from "./text-metrics.ts";

const USAGE = `usage: bun tests/conformance/pilot-run.ts [--all] [--only <id>] [--group text|breakpoints|components] [--renderer none|mac|ios] [--reflow] [--out <dir>]
  --all       every fixture under tests/conformance/fixtures/<domain>/ (pilot.json cases keep their expectations)
  --only      one case id
  --group     text: only cases with expected text; breakpoints: only markswift-breakpoints fixtures; components: component fixtures
  --renderer  mac (default): macOS ImageRenderer, the per-PR gate;
              ios: iOS Simulator (UIHostingController + drawHierarchy, batched builds), the release gate; \`@bp\`
              captures render on MARKSWIFT_SIMULATOR_IPAD (default "iPad Pro 13-inch (M5)") after the iPhone batches;
              none: capture, compile and typecheck only, no render or comparison
  --reflow    reflow-tagged fixtures also capture 768; their 320/768 captures also render the 390-compiled code (reflow.png, reflowSsim, reflowDelta in compare.json);
              breakpoint-tagged fixtures add \`@bp\` entries: references at their widths and at T−1/T of every CSS width threshold, each scored for its own capture and for the one merged breakpoint view
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
  /** Wall time of `BrowserCapture.capture` for this capture, ms; both modes of one capture share it. */
  captureMs?: number;
  /** Motion frame captures: the paused time (ms) and whether Reduce Motion was on. */
  motion?: { t: number; reduced: boolean; layer?: string };
  /** `@open` captures: the layer shown, and the rest capture whose conversion renders it. */
  openLayer?: string;
  openSource?: string;
};
/** Provenance written to `run.json` and into every `compare.json`; `simulatorUdid`/`ipadUdid` stay in `run.json` only.
 * `ipadRenderer` (iOS runs with `@bp` entries) names the device those entries render on. */
interface RunEnvironment {
  sourceRevision: string;
  fixtureHashes: Record<string, string>;
  harnessHash: string;
  chrome: string;
  xcode: string;
  renderer: string;
  simulatorUdid: string | null;
  ipadRenderer: string | null;
  ipadUdid: string | null;
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
  /** The reflow view (the case's 390 conversion, or an `@bp` job's merged breakpoint view) framed at this capture's
   * size, rendered in the same batch as `reflow.png`. */
  reflow?: RenderResult;
}
// ponytail: fixed batch of 48 captures per native build, macOS or iOS (6 cases × 8 captures); tune if one batch
// build exceeds ~3 min.
const BATCH = 48;
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

/** The Swift view name of a capture key (`details-390-light-app@open:returns` → `PilotDetails390LightAppOpenReturns`). */
export const pilotName = (key: string) =>
  "Pilot" +
  key
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");

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
    ipadRenderer: null,
    ipadUdid: null,
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
async function saveSource(entry: PilotEntry, captured: Capture, out: string) {
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
      reflow: { type: "boolean" },
      out: { type: "string" },
    },
  }).values;
  if (flags.help) return console.log(USAGE);
  const { only, group } = flags;
  const out = resolve(flags.out ?? join(import.meta.dir, "out", new Date().toISOString().replace(/[:.]/g, "-")));
  const renderer = (flags.renderer ?? "mac") as Renderer;
  const reflow = flags.reflow === true;
  if (!["none", "mac", "ios"].includes(renderer)) throw new Error(`unknown renderer: ${renderer}\n${USAGE}`);
  const pilot = await loadPilot();
  const cases = flags.all ? await loadFixtureSet(pilot) : pilot;
  if (only && !cases.some((item) => item.id === only)) throw new Error(`unknown pilot case: ${only}`);
  if (group && group !== "text" && group !== "breakpoints" && group !== "components")
    throw new Error(`unknown pilot group: ${group}`);
  const selected = only
    ? cases.filter((item) => item.id === only)
    : group === "text"
      ? cases.filter((item) => item.expectedText !== undefined)
      : group === "breakpoints"
        ? cases.filter((item) => item.breakpoints)
        : group === "components"
          ? cases.filter((item) => item.fixture.startsWith("components/"))
          : cases;
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
  let bpBrowser: BrowserCapture | undefined;
  let report: RunReport | undefined;
  const specFor = (item: RunCase, theme: "light" | "dark", viewport?: CaptureRequest["viewport"]): CaptureRequest => ({
    screen: item.id,
    theme,
    url: `${server.origin}/${item.fixture}`,
    root: "[data-markswift-root]",
    screenshot: true,
    ...(viewport ? { viewport } : {}),
    async prepare(page) {
      const style = await page.addStyleTag({
        content: "[data-markswift-root] { width: 100% !important; }",
      });
      await style.evaluate((element) => (element as Element).setAttribute("data-markswift-harness", ""));
    },
  });
  try {
    for (const width of new Set(selected.flatMap((item) => widthsFor(item, reflow)))) {
      // Lockfile-pinned Chromium, never the auto-updating Chrome channel, so references reproduce on any machine.
      const browser = new BrowserCapture({ dpr: 2, viewport: { width, height: 2000 }, channel: "chromium" });
      await browser.start();
      browsers.set(width, browser);
    }
    /** Breakpoint cases (--reflow): bands planned from one 390 capture, as `convert({ breakpoints })` plans them. */
    const bpCases = reflow ? selected.filter((item) => item.breakpoints) : [];
    const bpPlans = new Map<string, BandPlan>();
    const references = new Map<string, number[]>();
    const bpErrors: string[] = [];
    if (bpCases.length) {
      bpBrowser = new BrowserCapture({ dpr: 2, viewport: { width: 390, height: 2000 }, channel: "chromium" });
      await bpBrowser.start();
    }
    for (const item of bpCases) {
      try {
        const { layout } = await bpBrowser!.capture(
          { ...specFor(item, "light"), screenshot: false },
          htmlIdentity,
          `pilot:${item.fixture}`,
        );
        const plan = planBands(layout.conditions, {
          first: { width: 390, height: 2000 },
          devices: item.breakpoints!.map((width) => ({ width, height: 2000 })),
          max: 1376,
        });
        if (!plan.edges.length) throw new Error("markswift-breakpoints fixture has no width threshold");
        bpPlans.set(item.id, plan);
        references.set(item.id, bpReferences(plan.edges, item.breakpoints!));
      } catch (error) {
        bpErrors.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const matrix = buildMatrix(selected, reflow, references);
    const env = await environment(cases, renderer, `Chromium ${browsers.values().next().value!.version}`);
    report = { expected: matrix.length, completed: 0, errors: [...bpErrors], environment: env, entries: [] };
    for (const error of bpErrors) console.error(error);
    console.log(
      `expected ${matrix.length} ${renderer === "none" ? "capture/typecheck" : `${env.renderer} comparison`} outputs`,
    );
    /** 390 conversions of reflow-tagged cases by `<id>/<theme>/<mode>`; their 320/768 captures re-render them. */
    const reflowSources = new Map<string, ConversionResult>();
    /** The merged breakpoint view of each breakpoint case by `<id>/<theme>`: every band capture, compiled once
     * (`<out>/_bp/<id>-bp-<theme>-app/`); its `@bp` references re-render it at their sizes. */
    const bpSources = new Map<string, ConversionResult>();
    for (const item of bpCases) {
      const plan = bpPlans.get(item.id);
      for (const theme of plan ? item.themes : []) {
        const key = `${item.id}-bp-${theme}-app`;
        try {
          const bands: Capture[] = [];
          // Band captures and container-query extras, ascending (as `convert({ breakpoints })` passes them).
          for (const viewport of [...plan!.captures, ...plan!.extra].sort((a, b) => a.width - b.width))
            bands.push(
              await bpBrowser!.capture(
                { ...specFor(item, theme, viewport), screenshot: false, breakpoints: true },
                htmlIdentity,
                `pilot:${item.fixture}`,
              ),
            );
          const dir = join(out, "_bp", key);
          const swiftDir = join(dir, "swift");
          const name = pilotName(key);
          const fonts = await packageFonts(
            unionFaces(bands.map((band) => band.layout.fonts)),
            new Map(bands.flatMap((band) => band.fontFiles).map((f) => [f.file, f.bytes])),
          );
          const compiled = compileLayout(bands[0]!.layout, {
            name,
            mode: "app",
            variants: bands.slice(1).map((band) => band.layout),
            bundledFamilies: bundledFamilies(fonts),
            fontMetrics: metricsForFonts(fonts),
          });
          if (fonts.faces.length) {
            compiled.files[`${name}+Fonts.swift`] = registrationSwift(fonts.faces, name);
            compiled.files[`${name}+UIAppFonts.plist.fragment`] = fonts.plist;
          }
          // Capture warnings of every band, then the merge's own (as `convert` reports them).
          const warnings = [
            ...new Map(bands.flatMap((band) => band.warnings).map((w) => [w.message, w])).values(),
            ...compiled.warnings,
          ];
          await mkdir(swiftDir, { recursive: true });
          for (const [file, content] of Object.entries(compiled.files)) await Bun.write(join(swiftDir, file), content);
          await Bun.write(join(dir, "diagnostics.json"), JSON.stringify(compiled.diagnostics, null, 2));
          await Bun.write(join(dir, "warnings.json"), JSON.stringify(warnings, null, 2));
          const check = await typecheck(swiftDir);
          await Bun.write(join(dir, "typecheck.json"), JSON.stringify(check, null, 2));
          if (!check.ok) throw new Error(`Swift typecheck failed: ${check.output.slice(0, 500)}`);
          bpSources.set(`${item.id}/${theme}`, {
            ...compiled,
            layout: bands[0]!.layout,
            assets: { ...compiled.assets, ...fonts.assets },
            warnings: [...warnings, ...fonts.notes],
          });
        } catch (error) {
          report.errors.push(`${key}: ${String(error)}`);
          console.error(`${key}: ${String(error)}`);
        }
      }
    }
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
        for (const id of result.openLayer ? [] : (item.anchors ?? [])) {
          const node = findNode(layout.root, id);
          if (!node) throw new Error(`anchor ${id} not found`);
          anchors.push({
            id,
            mismatch: await regionMismatch(browserPng, nativePng, node.bounds, layout.dpr),
          });
        }
        let reflowFields:
          | { reflowTag: string; reflowSource: string; reflowSsim: number; reflowMismatch: number; reflowDelta: number }
          | undefined;
        if (entry.arm || (reflow && item.reflow && entry.width !== 390)) {
          const source = entry.arm
            ? bpSources.get(`${item.id}/${entry.theme}`)
            : reflowSources.get(`${item.id}/${entry.theme}/${entry.mode}`);
          const reflowSource = entry.arm
            ? `${item.id}-bp-${entry.theme}-app`
            : `${item.id}-390-${entry.theme}-${entry.mode}`;
          const reflowTag = !entry.arm
            ? item.reflow!
            : [...bpPlans.get(item.id)!.captures, ...bpPlans.get(item.id)!.extra].some((c) => c.width === entry.width)
              ? "breakpoint"
              : "breakpoint-edge";
          if (!source) throw new Error(`reflow source ${reflowSource} missing`);
          const reflowPng = join(dir, "reflow.png");
          // Same compiled Swift (390, or the merged breakpoint view), framed at this capture's size: only the proposal
          // width changes. It rendered in this capture's batch.
          const r = await compare(browserPng, reflowPng, join(dir, "reflow-diff.png"), layout.dpr);
          reflowFields = {
            reflowTag,
            reflowSource,
            reflowSsim: r.ssim,
            reflowMismatch: r.mismatch,
            reflowDelta: r.ssim - score.ssim,
          };
        }
        const artifactHashes = Object.fromEntries(
          await Promise.all(artifactFiles.map(async (file) => [file, await hashFile(join(dir, file))])),
        );
        if (textMetrics) artifactHashes["text.json"] = await hashFile(join(dir, "text.json"));
        if (reflowFields)
          for (const file of ["reflow.png", "reflow-diff.png"]) artifactHashes[file] = await hashFile(join(dir, file));
        await Bun.write(
          join(dir, "compare.json"),
          JSON.stringify(
            {
              ...score,
              ...result,
              ...reflowFields,
              fixture: item.fixture,
              anchors,
              sourceRevision: env.sourceRevision,
              fixtureHash: env.fixtureHashes[item.id],
              harnessHash: env.harnessHash,
              artifactHashes,
              capturedAt: env.capturedAt,
              chrome: env.chrome,
              xcode: env.xcode,
              renderer: entry.arm && env.ipadRenderer ? env.ipadRenderer : env.renderer,
              dpr: env.dpr,
              viewportHeight: item.viewportHeight ?? env.viewportHeight,
              rootWidthOverride: env.rootWidthOverride,
            },
            null,
            2,
          ),
        );
        // Anchor values for review; the gate's threshold (`anchorMaxMismatch`) lives in the policy.
        const status = `SSIM ${score.ssim.toFixed(4)} mismatch ${score.mismatch.toFixed(4)}${anchors.map((a) => ` ${a.id} ${a.mismatch.toFixed(3)}`).join("")}${reflowFields ? ` reflow Δ ${reflowFields.reflowDelta.toFixed(4)}` : ""}`;
        report!.completed++;
        console.log(`${entry.key}: ${status} (${report!.completed}/${report!.expected})`);
      } catch (error) {
        report!.errors.push(`${entry.key}: ${String(error)}`);
        console.error(`${entry.key}: ${String(error)}`);
      }
    };
    const pending: Array<Job & { conversion: RenderResult; time?: number; forced?: "reduceMotion" }> = [];
    /** iOS `@bp` captures: rendered on the iPad after every iPhone batch (one simulator at a time). */
    const ipadPending: typeof pending = [];
    /** Render queued captures (with their reflow views) in native builds of BATCH, then score each. */
    const flush = async (queue = pending, udid = env.simulatorUdid!, work = `_${renderer}-work`) => {
      const label = renderer === "mac" ? "macOS" : "iOS";
      while (queue.length) {
        const jobs = queue.splice(0, BATCH);
        const outputs = jobs.flatMap((j) => [
          { result: j.conversion, output: join(j.dir, "native.png"), time: j.time, forced: j.forced },
          ...(j.reflow ? [{ result: j.reflow, output: join(j.dir, "reflow.png") }] : []),
        ]);
        const errors = await (renderer === "mac"
          ? renderMacBatch(outputs, join(out, work))
          : renderIos(outputs, join(out, work), udid)
        ).catch((error) => new Map(outputs.map((o) => [o.output, String(error)])));
        for (const j of jobs) {
          const failed = errors.get(join(j.dir, "native.png")) ?? errors.get(join(j.dir, "reflow.png"));
          if (failed) {
            report!.errors.push(`${j.entry.key}: ${label} render failed: ${failed}`);
            console.error(`${j.entry.key}: ${label} render failed: ${failed}`);
          } else await finish(j);
        }
      }
    };
    for (const item of selected) {
      // Rest captures, then the case's `@bp` references (bpBrowser, viewport per width).
      const slots = [
        ...widthsFor(item, reflow).map((width) => ({ width, bp: false })),
        ...(references.get(item.id) ?? []).map((width) => ({ width, bp: true })),
      ];
      for (const { width, bp } of slots) {
        for (const theme of item.themes) {
          const pair = matrix.filter(
            (entry) =>
              entry.case.id === item.id &&
              entry.width === width &&
              entry.theme === theme &&
              !entry.frame &&
              (entry.arm === "bp") === bp,
          );
          const frames =
            width === 390 && !bp
              ? matrix.filter((entry) => entry.case.id === item.id && entry.theme === theme && entry.frame)
              : [];
          const spec = specFor(
            item,
            theme,
            bp || item.viewportHeight ? { width, height: item.viewportHeight ?? 2000 } : undefined,
          );
          let captured: Capture;
          let captureMs = 0;
          // 390 captures also open each in-flow layer: its shot is the browser side of an `@open` capture.
          let shots: OpenShots = {};
          try {
            const t0 = performance.now();
            const browser = bp ? bpBrowser! : browsers.get(width)!;
            const label = `pilot:${item.fixture}`;
            captured = await browser.capture(spec, htmlIdentity, label);
            captureMs = performance.now() - t0;
            if (width === 390 && !bp)
              shots = await captureLayers((s) => browser.capture(s, htmlIdentity, label), spec, captured, {
                probeDismiss: false,
              });
          } catch (error) {
            for (const entry of [...pair, ...frames])
              report.errors.push(`${entry.key}: capture failed: ${String(error)}`);
            continue;
          }
          /** Motion frames of this 390 app capture: browser paused at `t`, native at the same time, scored like any capture.
           * With `open`: that layer's `@open:<layer>@t:` enter frames, against the open render (066). */
          const captureFrames = async (
            sourceDir: string,
            conversion: RenderResult | undefined,
            open?: { layer: string; shot: OpenShots[string]; openArg: string },
          ) => {
            const layout = open ? { ...captured.layout, size: open.shot.size } : captured.layout;
            const clip = { x: -layout.viewport.x, y: -layout.viewport.y, width: layout.size.w, height: layout.size.h };
            for (const entry of frames.filter((f) => f.frame!.layer === open?.layer)) {
              const frame = entry.frame!;
              const result: RunEntry = {
                key: entry.key,
                caseId: item.id,
                viewportWidth: width,
                theme,
                mode: entry.mode,
                size: layout.size,
                loadedFonts: layout.fonts.filter((face) => face.loaded).length,
                warnings: captured.warnings.length,
                motion: frame,
              };
              report!.entries.push(result);
              try {
                const dir = join(out, entry.key);
                await mkdir(dir, { recursive: true });
                const browser = browsers.get(width)!;
                await Bun.write(
                  join(dir, "browser.png"),
                  open
                    ? await browser.captureLayerFrame(spec, open.shot.trigger, frame.t, clip)
                    : await browser.captureFrame(spec, frame, clip),
                );
                // The rest capture's inputs, so artifact hashes name what the frame was rendered from.
                for (const file of ["layout.json", "diagnostics.json", "warnings.json", "typecheck.json"])
                  await copyFile(join(sourceDir, file), join(dir, file));
                const job: Job = { entry, item, dir, layout, textMetrics: undefined, result };
                const forced = frame.reduced ? ("reduceMotion" as const) : undefined;
                const source = conversion && open ? { ...conversion, layout, openArg: open.openArg } : conversion;
                if (!source) {
                  report!.completed++;
                  console.log(`${entry.key}: captured (${report!.completed}/${report!.expected})`);
                } else {
                  pending.push({ ...job, conversion: source, time: frame.t / 1000, forced });
                  if (pending.length >= BATCH) await flush();
                }
              } catch (error) {
                report!.errors.push(`${entry.key}: ${String(error)}`);
                console.error(`${entry.key}: ${String(error)}`);
              }
            }
          };
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
              captureMs,
            };
            report.entries.push(result);
            try {
              // RBreakpoints §5: the threshold parser must agree with Chrome at every reference width.
              const off = entry.arm
                ? captured.layout.conditions.find((c) => {
                    const q = c.kind === "media" ? widthQuery(c.query) : undefined;
                    return q !== undefined && matchesWidth(q, width) !== c.matches;
                  })
                : undefined;
              if (off) throw new Error(`threshold parser disagrees with Chrome at ${width}px: ${off.query}`);
              const dir = await saveSource(entry, captured, out);
              const name = pilotName(entry.key);
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
                if (entry.mode === "app") {
                  await captureFrames(dir, undefined);
                  for (const [layer, openArg] of Object.entries(compiled.openStates ?? {}))
                    if (shots[layer]) await captureFrames(dir, undefined, { layer, shot: shots[layer], openArg });
                }
              } else {
                const conversion = {
                  ...compiled,
                  layout: captured.layout,
                  assets,
                  warnings: [...captured.warnings, ...fonts.notes],
                };
                if (reflow && item.reflow && width === 390)
                  reflowSources.set(`${item.id}/${theme}/${entry.mode}`, conversion);
                const reflowSource = entry.arm
                  ? bpSources.get(`${item.id}/${theme}`)
                  : reflow && item.reflow && width !== 390
                    ? reflowSources.get(`${item.id}/${theme}/${entry.mode}`)
                    : undefined;
                const queued = {
                  ...job,
                  conversion,
                  reflow: reflowSource && {
                    ...reflowSource,
                    layout: { ...reflowSource.layout, size: captured.layout.size },
                  },
                };
                if (entry.arm && renderer === "ios") ipadPending.push(queued);
                else {
                  pending.push(queued);
                  if (pending.length >= BATCH) await flush();
                }
                // The same view with each in-flow layer shown, against the browser's open shot.
                for (const [layer, openArg] of Object.entries(compiled.openStates ?? {})) {
                  const shot = shots[layer];
                  if (!shot?.png) continue;
                  const key = openKey(entry.key, layer);
                  const openDir = join(out, key);
                  const layout = { ...captured.layout, size: shot.size };
                  await mkdir(openDir, { recursive: true });
                  await Promise.all([
                    Bun.write(join(openDir, "browser.png"), shot.png),
                    Bun.write(join(openDir, "layout.json"), JSON.stringify(layout, null, 2)),
                    Bun.write(join(openDir, "warnings.json"), JSON.stringify(captured.warnings, null, 2)),
                    Bun.write(join(openDir, "diagnostics.json"), JSON.stringify(compiled.diagnostics, null, 2)),
                    Bun.write(join(openDir, "typecheck.json"), JSON.stringify(check, null, 2)),
                  ]);
                  const opened: RunEntry = { ...result, key, size: shot.size, openLayer: layer, openSource: entry.key };
                  report.entries.push(opened);
                  report.expected++;
                  const openJob: Job = {
                    entry: { ...entry, key },
                    item,
                    dir: openDir,
                    layout,
                    textMetrics: undefined,
                    result: opened,
                  };
                  const openConversion = { ...conversion, layout, openArg };
                  pending.push({ ...openJob, conversion: openConversion });
                  if (pending.length >= BATCH) await flush();
                  if (entry.mode === "app") await captureFrames(openDir, openConversion, { layer, shot, openArg });
                }
                if (entry.mode === "app") await captureFrames(dir, conversion);
              }
            } catch (error) {
              report.errors.push(`${entry.key}: ${String(error)}`);
              console.error(`${entry.key}: ${String(error)}`);
              if (entry.mode === "app")
                for (const frame of frames) report.errors.push(`${frame.key}: source ${entry.key} failed`);
            }
          }
        }
      }
    }
    await flush();
    if (ipadPending.length) {
      // Wide `@bp` references need a window wider than the iPhone's: the iPad, booted only now (K5: one at a time).
      await command(["xcrun", "simctl", "shutdown", env.simulatorUdid!], undefined, 60_000);
      const ipad = await ensureSimulator(process.env.MARKSWIFT_SIMULATOR_IPAD ?? "iPad Pro 13-inch (M5)");
      env.ipadRenderer = `${ipad.name} ${ipad.runtime}`;
      env.ipadUdid = ipad.udid;
      await flush(ipadPending, ipad.udid, "_ipad-work");
    }
  } finally {
    await Promise.all([...browsers.values(), ...(bpBrowser ? [bpBrowser] : [])].map((browser) => browser.stop()));
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
