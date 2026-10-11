import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { command } from "./process.ts";
import { macRenderMain, packageManifest, renderTest } from "./native-template.ts";

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

/** Reuse DerivedData, but replace all generated sources between serialized jobs. */
export async function renderNative(
  result: ConversionResult,
  work: string,
  output: string,
  stage: (message: string) => void,
  simulatorId?: string,
): Promise<void> {
  stage("Selecting iOS Simulator…");
  const inventory = JSON.parse(
    await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000),
  ) as SimulatorInventory;
  const device = selectSimulator(inventory, simulatorId ?? process.env.MARKSWIFT_SIMULATOR);
  const generated = join(work, "Sources", "Generated");
  const tests = join(work, "Tests", "PreviewTests");
  const testSource = renderTest(result, output);
  await rm(generated, { recursive: true, force: true });
  await mkdir(join(generated, "Fonts"), { recursive: true });
  await mkdir(join(generated, "Images"), { recursive: true });
  await mkdir(tests, { recursive: true });
  await Bun.write(join(work, "Package.swift"), packageManifest);
  await Bun.write(join(generated, "Fonts", ".keep"), "");
  await Bun.write(join(generated, "Images", ".keep"), "");
  for (const [file, value] of Object.entries(result.files)) {
    if (file.endsWith(".swift")) await Bun.write(join(generated, file), value);
  }
  for (const [file, value] of Object.entries(result.assets)) await Bun.write(join(generated, file), value);
  await Bun.write(
    join(generated, "MarkswiftPreviewResources.swift"),
    "import Foundation\nenum MarkswiftPreviewResources { static let bundle = Bundle.module }\n",
  );
  await Bun.write(join(tests, "PreviewTests.swift"), testSource);
  await rm(output, { force: true });
  stage(`Compiling Swift and rendering on ${device.name}…`);
  await command(
    [
      "xcodebuild",
      "test",
      "-scheme",
      "MarkswiftPreview",
      "-destination",
      `platform=iOS Simulator,id=${device.udid}`,
      "-derivedDataPath",
      join(work, ".build", "DerivedData"),
      "-parallel-testing-enabled",
      "NO",
      "-only-testing:PreviewTests/PreviewTests/testSnapshot",
      "-quiet",
    ],
    work,
    240_000,
  );
  if (!(await Bun.file(output).exists())) throw new Error("Build finished but no native image was produced.");
  stage("Native image ready.");
}

/**
 * Simulator-free render: the generated Swift plus a `main.swift` built for macOS with `swiftc` and
 * run once. ImageRenderer on macOS matches the iOS runtime closely except for text line heights,
 * which macOS rounds to whole points.
 */
// ponytail: one swiftc build per capture (≈ 3–5 s); batch captures per build if the per-PR job outgrows ~20 min.
export async function renderMac(result: ConversionResult, work: string, output: string): Promise<void> {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const sources: string[] = [];
  for (const [file, value] of Object.entries(result.files)) {
    if (!file.endsWith(".swift")) continue;
    await Bun.write(join(work, file), value);
    sources.push(join(work, file));
  }
  for (const [file, value] of Object.entries(result.assets)) await Bun.write(join(work, file), value);
  await Bun.write(join(work, "main.swift"), macRenderMain(result, join(work, "Fonts"), output));
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
