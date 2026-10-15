import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { command } from "./process.ts";
import { canvas, macRenderMain, type RenderResult, renderAppMain, renderAppPlist } from "./native-template.ts";

export interface SimulatorInventory {
  devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
}

/** Select one concrete iOS device; callers can record the returned runtime and UDID. */
export function selectSimulator(inventory: SimulatorInventory, preferred?: string) {
  const candidates = Object.entries(inventory.devices)
    .filter(([runtime]) => /iOS-(\d+)/.test(runtime) && Number(runtime.match(/iOS-(\d+)/)?.[1]) >= 18)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([runtime, devices]) =>
      devices.filter((d) => d.isAvailable && d.name.startsWith("iPhone")).map((device) => ({ ...device, runtime })),
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
}

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
  return { udid: device.udid, name: device.name, runtime: device.runtime };
}

/** Compile every job's view into one ad-hoc-signed simulator app (no simulator needed); returns the `.app` path. */
export async function buildRenderApp(jobs: RenderJob[], work: string): Promise<string> {
  work = resolve(work);
  const src = join(work, "src");
  const app = join(work, "Render.app");
  await rm(work, { recursive: true, force: true });
  await mkdir(src, { recursive: true });
  await mkdir(app, { recursive: true });
  const written = new Map<string, string>();
  for (const [i, { result }] of jobs.entries()) {
    for (const [file, value] of Object.entries(result.files)) {
      if (!file.endsWith(".swift")) continue;
      const previous = written.get(file);
      // One view rendered twice (an `@open` capture and its rest capture) brings identical files.
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
  const sources: string[] = [];
  for (const [file, value] of written) {
    await Bun.write(join(src, file), value);
    sources.push(join(src, file));
  }
  await Bun.write(join(src, "RenderApp.swift"), renderAppMain(jobs.map((job) => job.result)));
  sources.push(join(src, "RenderApp.swift"));
  await Bun.write(join(app, "Info.plist"), renderAppPlist);
  await Bun.write(
    join(work, "jobs.json"),
    JSON.stringify(
      jobs.map(({ result, output }, i) => {
        const { w, h, dark, color } = canvas(result);
        return { view: i, w, h, dark, ...color, assets: join(work, "jobs", String(i)), output: resolve(output) };
      }),
    ),
  );
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
 * job that produced no image (the app's `error <i>: …` line, else "no image produced").
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
  const errors = new Map<string, string>();
  for (const [i, job] of jobs.entries()) {
    if (await Bun.file(job.output).exists()) continue;
    const line = log.split("\n").find((text) => text.startsWith(`error ${i}: `));
    errors.set(
      job.output,
      line?.slice(`error ${i}: `.length).trim() ?? `no image produced; app output: ${log.slice(-500)}`,
    );
  }
  return errors;
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
 * Simulator-free render: the generated Swift plus a `main.swift` built for macOS with `swiftc` and
 * run once. ImageRenderer on macOS matches the iOS runtime closely except for text line heights,
 * which macOS rounds to whole points, but cannot draw UIKit/AppKit controls (yellow placeholder); the
 * iOS renderer uses drawHierarchy and can.
 */
// ponytail: one swiftc build per capture (≈ 3–5 s); batch captures per build if the per-PR job outgrows ~20 min.
export async function renderMac(
  result: RenderResult,
  work: string,
  output: string,
  forced?: "pressed" | "focused",
): Promise<void> {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const sources: string[] = [];
  for (const [file, value] of Object.entries(result.files)) {
    if (!file.endsWith(".swift")) continue;
    await Bun.write(join(work, file), value);
    sources.push(join(work, file));
  }
  for (const [file, value] of Object.entries(result.assets)) await Bun.write(join(work, file), value);
  await Bun.write(join(work, "main.swift"), macRenderMain(result, join(work, "Fonts"), output, forced));
  sources.push(join(work, "main.swift"));
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
    240_000,
  );
  await rm(output, { force: true });
  await command([join(work, "render")], work, 60_000);
  if (!(await Bun.file(output).exists())) throw new Error("macOS render produced no image");
}
