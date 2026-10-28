import { mkdir, rm } from "node:fs/promises";
import { availableParallelism, loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { command } from "./process.ts";
import {
  canvas,
  macRenderMain,
  type ForcedState,
  type RenderResult,
  renderAppMain,
  renderAppPlist,
} from "./native-template.ts";

export interface SimulatorInventory {
  devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
}

/** Select one concrete iOS device; callers can record the returned runtime and UDID. Without `preferred` only iPhones
 * qualify; a named or UDID-pinned `preferred` may also be an iPad (the pilot's wide `@bp` renderer). */
export function selectSimulator(inventory: SimulatorInventory, preferred?: string) {
  const candidates = Object.entries(inventory.devices)
    .filter(([runtime]) => /iOS-(\d+)/.test(runtime) && Number(runtime.match(/iOS-(\d+)/)?.[1]) >= 18)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([runtime, devices]) =>
      devices
        .filter((d) => d.isAvailable && (d.name.startsWith("iPhone") || (preferred && d.name.startsWith("iPad"))))
        .map((device) => ({ ...device, runtime })),
    );
  const device = preferred
    ? candidates.find((d) => d.udid === preferred || d.name === preferred)
    : (candidates.find((d) => d.state === "Booted") ?? candidates[0]);
  if (!device) throw new Error("No suitable iOS Simulator found. Install an iOS 18+ iPhone simulator in Xcode.");
  return device;
}

export interface RenderJob {
  result: RenderResult;
  output: string;
  /** Seconds into every animation; absent = settled. */
  time?: number;
  forced?: ForcedState;
}

const FORCED_RAW: Record<ForcedState, number> = { pressed: 1, focused: 2, reduceMotion: 4 };

// ponytail: calibration knobs, measured on the 3-core xcode-27 CI runner (#34). Every simulator boot, first or warm,
// drove the 1-minute load to 300–600 for 4–9 min; Chromium pages and swiftc stalled meanwhile and ran normally once it
// fell below ~120 (40 per core). The load lags the boot (it can still read ~80 when bootstatus returns), so it must stay
// below that for a whole window. Lower the factor if stalls return; the cap keeps a busy host from waiting forever.
const QUIET_LOAD_PER_CPU = 40;
const QUIET_WINDOW_MS = 2 * 60_000;
const QUIET_CAP_MS = 15 * 60_000;

/**
 * Boot the pinned simulator (`preferred`: name or UDID), creating a device of that name on the newest
 * installed iOS runtime when none exists.
 */
export async function ensureSimulator(preferred = process.env.MARKSWIFT_SIMULATOR ?? "iPhone 17") {
  const { runtimes } = JSON.parse(
    await command(["xcrun", "simctl", "list", "runtimes", "available", "-j"], undefined, 15_000),
  ) as { runtimes: Array<{ identifier: string; version: string; platform: string }> };
  const ios = runtimes
    .filter((runtime) => runtime.platform === "iOS")
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!ios.length)
    throw new Error(
      "No iOS Simulator runtime installed. Install one with `xcodebuild -downloadPlatform iOS`, or run the Visual workflow with renderer=ios.",
    );
  const devices = async () =>
    JSON.parse(
      await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000),
    ) as SimulatorInventory;
  let device: ReturnType<typeof selectSimulator>;
  try {
    device = selectSimulator(await devices(), preferred);
  } catch (error) {
    if (/^[0-9A-F]{8}-[0-9A-F-]{27}$/i.test(preferred)) throw error;
    await command(
      [
        "xcrun",
        "simctl",
        "create",
        preferred,
        `com.apple.CoreSimulator.SimDeviceType.${preferred.replace(/ /g, "-")}`,
        ios[0]!.identifier,
      ],
      undefined,
      60_000,
    );
    device = selectSimulator(await devices(), preferred);
  }
  await command(["xcrun", "simctl", "bootstatus", device.udid, "-b"], undefined, 300_000);
  if (device.state !== "Booted") {
    const start = Date.now();
    let quietSince = start;
    while (Date.now() - quietSince < QUIET_WINDOW_MS && Date.now() - start < QUIET_CAP_MS) {
      await Bun.sleep(5_000);
      if (loadavg()[0]! > availableParallelism() * QUIET_LOAD_PER_CPU) quietSince = Date.now();
    }
    console.log(
      `${device.name} booted; host quiet after ${Math.round((Date.now() - start) / 1000)} s (1-min load ${loadavg()[0]!.toFixed(0)})`,
    );
  }
  return { udid: device.udid, name: device.name, runtime: device.runtime };
}

/**
 * Write a render batch under `work` (emptied first): every job's generated Swift once into `src/` (a duplicate file
 * must be identical), `main` as `src/<mainFile>`, each job's assets under `jobs/<i>/`, and `jobs.json`. Returns the
 * Swift sources to compile.
 */
async function writeBatch(jobs: RenderJob[], work: string, mainFile: string, main: string): Promise<string[]> {
  const src = join(work, "src");
  await rm(work, { recursive: true, force: true });
  await mkdir(src, { recursive: true });
  const written = new Map<string, string>();
  for (const [i, { result }] of jobs.entries()) {
    for (const [file, value] of Object.entries(result.files)) {
      if (!file.endsWith(".swift")) continue;
      const previous = written.get(file);
      // One view rendered twice (an `@open` capture and its rest capture, motion frames) brings identical files.
      if (previous !== undefined && previous !== value) throw new Error(`duplicate generated file ${file}`);
      written.set(file, value);
    }
    const assets = join(work, "jobs", String(i));
    await mkdir(assets, { recursive: true });
    for (const [file, value] of Object.entries(result.assets)) {
      await mkdir(dirname(join(assets, file)), { recursive: true });
      await Bun.write(join(assets, file), value);
    }
  }
  written.set(mainFile, main);
  const sources: string[] = [];
  for (const [file, value] of written) {
    await Bun.write(join(src, file), value);
    sources.push(join(src, file));
  }
  await Bun.write(
    join(work, "jobs.json"),
    JSON.stringify(
      jobs.map(({ result, output, time, forced }, i) => {
        const { w, h, dark, color } = canvas(result);
        return {
          view: i,
          w,
          h,
          dark,
          ...color,
          assets: join(work, "jobs", String(i)),
          output: resolve(output),
          ...(time !== undefined && Number.isFinite(time) ? { time } : {}),
          ...(forced ? { forced: FORCED_RAW[forced] } : {}),
        };
      }),
    ),
  );
  return sources;
}

/** Output path → error for every job that produced no image: the renderer's `error <i>: …` line, else its output tail. */
async function missingImages(jobs: RenderJob[], log: string): Promise<Map<string, string>> {
  const errors = new Map<string, string>();
  for (const [i, job] of jobs.entries()) {
    if (await Bun.file(job.output).exists()) continue;
    const line = log.split("\n").find((text) => text.startsWith(`error ${i}: `));
    errors.set(
      job.output,
      line?.slice(`error ${i}: `.length).trim() ?? `no image produced; renderer output: ${log.slice(-500)}`,
    );
  }
  return errors;
}

/** Compile every job's view into one ad-hoc-signed simulator app (no simulator needed); returns the `.app` path. */
export async function buildRenderApp(jobs: RenderJob[], work: string): Promise<string> {
  work = resolve(work);
  const app = join(work, "Render.app");
  const sources = await writeBatch(jobs, work, "RenderApp.swift", renderAppMain(jobs.map((job) => job.result)));
  await mkdir(app, { recursive: true });
  await Bun.write(join(app, "Info.plist"), renderAppPlist);
  await command(
    [
      "xcrun",
      "--sdk",
      "iphonesimulator",
      "swiftc",
      "-target",
      "arm64-apple-ios18.0-simulator",
      "-swift-version",
      "6",
      "-strict-concurrency=complete",
      "-default-isolation",
      "MainActor",
      "-parse-as-library",
      "-module-name",
      "Render",
      "-o",
      join(app, "Render"),
      ...sources,
    ],
    work,
    600_000,
  );
  await command(["codesign", "--force", "--sign", "-", app]);
  return app;
}

/**
 * Render a batch on the booted simulator `udid` in one app launch. Returns output path → error for every
 * job that produced no image.
 */
export async function renderIos(jobs: RenderJob[], work: string, udid: string): Promise<Map<string, string>> {
  await Promise.all(jobs.map((job) => rm(job.output, { force: true })));
  const app = await buildRenderApp(jobs, work);
  await command(["xcrun", "simctl", "install", udid, app], undefined, 120_000);
  let log: string;
  try {
    log = await command(
      [
        "xcrun",
        "simctl",
        "launch",
        "--console-pty",
        "--terminate-running-process",
        udid,
        "com.markswift.render",
        join(resolve(work), "jobs.json"),
      ],
      undefined,
      60_000 + 3_000 * jobs.length,
    );
  } catch (error) {
    // A crash or non-zero exit still leaves the images written before it; report per job below.
    log = String(error);
  }
  return missingImages(jobs, log);
}

/** Playground entry point: one conversion rendered through the batched iOS app on the selected simulator. */
export async function renderNative(
  result: ConversionResult,
  work: string,
  output: string,
  stage: (message: string) => void,
  simulatorId?: string,
): Promise<void> {
  stage("Selecting iOS Simulator…");
  const device = await ensureSimulator(simulatorId ?? process.env.MARKSWIFT_SIMULATOR);
  stage(`Compiling Swift and rendering on ${device.name}…`);
  const failed = (await renderIos([{ result, output }], work, device.udid)).get(output);
  if (failed) throw new Error(failed);
  if (!(await Bun.file(output).exists())) throw new Error("Build finished but no native image was produced.");
  stage("Native image ready.");
}

/**
 * Simulator-free render of a batch: the generated Swift plus one `main.swift`, built once for macOS with `swiftc`,
 * then run once per job (a fresh process each: several jobs in one process shifted pixels depending on the jobs
 * rendered before). ImageRenderer on macOS matches the iOS runtime closely except for text line heights, which macOS
 * rounds to whole points, but cannot draw UIKit/AppKit controls (yellow placeholder); the iOS renderer uses
 * drawHierarchy and can. Returns output path → error for every job that produced no image.
 */
export async function renderMacBatch(jobs: RenderJob[], work: string): Promise<Map<string, string>> {
  work = resolve(work);
  await Promise.all(jobs.map((job) => rm(job.output, { force: true })));
  const sources = await writeBatch(jobs, work, "main.swift", macRenderMain(jobs.map((job) => job.result)));
  const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"], undefined, 15_000)).trim();
  await command(
    [
      "xcrun",
      "swiftc",
      "-sdk",
      sdk,
      "-target",
      "arm64-apple-macos15.0",
      "-swift-version",
      "6",
      "-strict-concurrency=complete",
      "-default-isolation",
      "MainActor",
      "-o",
      join(work, "render"),
      ...sources,
    ],
    work,
    600_000,
  );
  const logs: string[] = [];
  for (const i of jobs.keys()) {
    // A failed run still reports through its `error <i>:` line or output tail below.
    logs.push(await command([join(work, "render"), join(work, "jobs.json"), String(i)], work, 60_000).catch(String));
  }
  return missingImages(jobs, logs.join("\n"));
}

/** One conversion through `renderMacBatch`; throws when it produced no image. */
export async function renderMac(
  result: RenderResult,
  work: string,
  output: string,
  forced?: ForcedState,
  motionTime?: number,
): Promise<void> {
  const failed = (await renderMacBatch([{ result, output, time: motionTime, forced }], work)).get(output);
  if (failed) throw new Error(`macOS render produced no image: ${failed}`);
}
