import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { parseColor } from "../../src/css/color.ts";
import type { CompileResult, LayoutDoc } from "../../src/compiler/index.ts";
import { planNativeModules, type NativeModule } from "./native-modules.ts";
import { nativeArtifactHashes, requireNativeSnapshotTest, requireUnchangedNativeInputs } from "./native-evidence.ts";

interface SimulatorInventory {
  devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
}

export interface VisualSnapshot {
  bundle: Pick<CompileResult, "name" | "files"> & { assets?: Record<string, Uint8Array> };
  /** Views compiled together by compileLayouts can share one namespace and helper set. */
  moduleID?: string;
  layout: LayoutDoc;
  outputs: Record<number, string>;
  /** Actual SwiftUI anchor observations, only for bundles compiled with instrumentation. */
  geometryOutputs?: Record<number, string>;
  /** UIKit-backed controls require a mounted view; ImageRenderer omits them. */
  hosted?: boolean;
}

function packageManifest(modules: NativeModule[]): string {
  return `// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "MarkswiftVisualSmoke",
    platforms: [.iOS("18.0")],
    targets: [
${modules.map(module => `        .target(name: "${module.name}", resources: [${module.resources.map(path => `.copy(${JSON.stringify(path)})`).join(", ")}], swiftSettings: [.unsafeFlags(["-warnings-as-errors"])]),`).join("\n")}
        .testTarget(name: "PreviewTests", dependencies: [${modules.map(module => `"${module.name}"`).join(", ")}], swiftSettings: [.unsafeFlags(["-warnings-as-errors"])])
    ],
    swiftLanguageModes: [.v6]
)
`;
}

async function command(args: string[], cwd?: string, timeoutMs = 300_000, logPath?: string): Promise<string> {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    const output = stdout + stderr;
    if (logPath) await Bun.write(logPath, output);
    if (timedOut) throw new Error(`${args[0]} timed out after ${timeoutMs / 1000}s`);
    if (code !== 0) throw new Error(`${args[0]} failed:\n${output.slice(-12_000)}`);
    return output;
  } finally {
    clearTimeout(timer);
  }
}

function selectSimulator(inventory: SimulatorInventory): { udid: string; name: string } {
  const candidates = Object.entries(inventory.devices)
    .filter(([runtime]) => /iOS-(\d+)/.test(runtime) && Number(runtime.match(/iOS-(\d+)/)?.[1]) >= 18)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([, devices]) => devices.filter(device => device.isAvailable && device.name.startsWith("iPhone")));
  const preference = process.env.MARKSWIFT_SIMULATOR;
  const selected = (preference ? candidates.find(device => device.udid === preference || device.name === preference) : undefined)
    ?? candidates.find(device => device.state === "Booted") ?? candidates[0];
  if (!selected) throw new Error("No available iOS 18+ iPhone Simulator. Install one in Xcode.");
  if (preference && selected.udid !== preference && selected.name !== preference) {
    throw new Error(`MARKSWIFT_SIMULATOR=${preference} is not an available iOS 18+ iPhone Simulator.`);
  }
  return selected;
}

export function nativeSnapshotTestSource(snapshots: VisualSnapshot[], modules: NativeModule[], snapshotModules: string[]): string {
  const renders = snapshots.flatMap(({ bundle, layout, outputs, hosted, geometryOutputs }, index) => {
    const color = parseColor(layout.canvas);
    if (!color) throw new Error(`Unsupported captured canvas color: ${layout.canvas}`);
    const module = snapshotModules[index]!;
    const register = bundle.files["Font+Markswift.swift"] ? `        ${module}.MarkswiftBundledFonts.register(in: ${module}.MarkswiftPreviewResources.bundle)\n` : "";
    for (const width of Object.keys(geometryOutputs ?? {})) {
      if (!outputs[Number(width)]) throw new Error(`Geometry width ${width} has no screenshot job`);
      if (!bundle.files["MarkswiftGeometry.swift"]) throw new Error("Geometry output requires an instrumented bundle");
    }
    return Object.entries(outputs).map(([width, output], job) => {
      const geometryOutput = geometryOutputs?.[Number(width)];
      const collector = `geometry${index}_${job}`;
      const setup = geometryOutput ? `        let ${collector} = ${module}.MarkswiftGeometryCollector()\n` : "";
      const content = geometryOutput ? `${module}.MarkswiftGeometryReader(content: ${module}.${bundle.name}(), collector: ${collector})` : `${module}.${bundle.name}()`;
      const collect = geometryOutput ? `\n        XCTAssertFalse(${collector}.snapshot().isEmpty, "Actual native geometry was unavailable")\n        guard !${collector}.snapshot().isEmpty else { throw NSError(domain: "MarkswiftGeometry", code: 1) }\n        try ${collector}.encoded(backend: ${JSON.stringify(hosted ? "hosted" : "image-renderer")}, width: ${Number(width)}, height: ${layout.size.h}).write(to: URL(fileURLWithPath: ${JSON.stringify(geometryOutput)}))` : "";
      return `
${register}${setup}        try ${hosted ? "hostedSnapshot" : "snapshot"}(content: ${content}, width: ${Number(width)}, height: ${layout.size.h},
                     canvas: Color(.sRGB, red: ${color.r}, green: ${color.g}, blue: ${color.b}, opacity: ${color.a}),
                     scheme: .${layout.combo.theme}, output: ${JSON.stringify(output)})${collect}`;
    });
  }).join("");
  return `import XCTest
import SwiftUI
import UIKit
${modules.map(module => `@testable import ${module.name}`).join("\n")}

final class PreviewTests: XCTestCase {
    @MainActor
    func testSnapshots() throws {${renders}
    }

    @MainActor
    private func snapshot<Content: View>(content: Content, width: CGFloat, height: CGFloat, canvas: Color, scheme: ColorScheme, output: String) throws {
        let framed = content
            .frame(width: width, height: height, alignment: .topLeading)
            .background(canvas)
            .environment(\\.colorScheme, scheme)
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 2
        renderer.proposedSize = ProposedViewSize(width: width, height: height)
        let image = try XCTUnwrap(renderer.uiImage, "SwiftUI did not render an image")
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: output))
    }

    @MainActor
    private func hostedSnapshot<Content: View>(content: Content, width: CGFloat, height: CGFloat, canvas: Color, scheme: ColorScheme, output: String) throws {
        let framed = content
            .frame(width: width, height: height, alignment: .topLeading)
            .background(canvas)
            .environment(\\.colorScheme, scheme)
            .ignoresSafeArea()
        let host = UIHostingController(rootView: framed)
        host.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        host.view.backgroundColor = .clear
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        let window: UIWindow
        if let scene = UIApplication.shared.connectedScenes.first(where: { $0 is UIWindowScene }) as? UIWindowScene {
            window = UIWindow(windowScene: scene)
            window.frame = bounds
        } else {
            window = UIWindow(frame: bounds)
        }
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        // UIKit-backed SwiftUI controls commit their contents after layout.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: window.bounds.size, format: format)
        let image = renderer.image { context in
            host.view.layer.render(in: context.cgContext)
        }
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: output))
    }
}
`;
}

/** Keep independently compiled token/shape namespaces in separate Swift modules. */
export async function renderVisualSnapshots(snapshots: VisualSnapshot[], work: string): Promise<{ artifactHashes: Record<string, string>; simulator: string }> {
  if (!snapshots.length) throw new Error("Visual rendering needs at least one compiled snapshot");
  const { modules, snapshotModules } = planNativeModules(snapshots);
  const outputs = snapshots.flatMap(snapshot => [...Object.values(snapshot.outputs), ...Object.values(snapshot.geometryOutputs ?? {})]);
  if (new Set(outputs).size !== outputs.length) throw new Error("Visual output paths must be distinct");
  const inventory = JSON.parse(await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000)) as SimulatorInventory;
  const device = selectSimulator(inventory);
  const testDir = join(work, "Tests", "PreviewTests");
  await rm(join(work, "Sources"), { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await Bun.write(join(work, "Package.swift"), packageManifest(modules));
  for (const module of modules) {
    const generated = join(work, "Sources", module.name);
    await mkdir(join(generated, "Fonts"), { recursive: true });
    await Bun.write(join(generated, "Fonts", ".keep"), "");
    for (const [file, source] of Object.entries(module.files)) {
      if (file.endsWith(".swift")) await Bun.write(join(generated, file), source);
    }
    for (const [file, bytes] of Object.entries(module.assets ?? {})) {
      await mkdir(dirname(join(generated, file)), { recursive: true });
      await Bun.write(join(generated, file), bytes);
    }
    await Bun.write(join(generated, "MarkswiftPreviewResources.swift"), "import Foundation\nenum MarkswiftPreviewResources { static let bundle = Bundle.module }\n");
  }
  await Bun.write(join(testDir, "PreviewTests.swift"), nativeSnapshotTestSource(snapshots, modules, snapshotModules));
  const inputRoots = [join(work, "Package.swift"), join(work, "Sources"), join(work, "Tests")];
  const inputHashes = await nativeArtifactHashes(inputRoots);
  for (const output of outputs) await rm(output, { force: true });
  console.log(`Rendering generated Swift on ${device.name}…`);
  const startedAt = new Date().toISOString();
  const execution = join(work, "executions", `${startedAt.replaceAll(/[:.]/g, "-")}-${randomUUID()}`);
  await mkdir(execution, { recursive: true });
  const logPath = join(execution, "xcodebuild.log"), resultBundle = join(execution, "NativeRender.xcresult");
  await command([
    "xcodebuild", "test", "-scheme", "MarkswiftVisualSmoke-Package", "-destination", `platform=iOS Simulator,id=${device.udid}`,
    "-derivedDataPath", join(work, ".build", "DerivedData"), "-parallel-testing-enabled", "NO",
    "-resultBundlePath", resultBundle, "-collect-test-diagnostics", "never",
    "-only-testing:PreviewTests/PreviewTests/testSnapshots", "-quiet",
  ], work, 300_000, logPath);
  const reportPath = join(execution, "xcresult-tests.json");
  const report = await command(["xcrun", "xcresulttool", "get", "test-results", "tests", "--schema-version", "0.4.0", "--path", resultBundle], work, 30_000, reportPath);
  requireNativeSnapshotTest(JSON.parse(report));
  requireUnchangedNativeInputs(inputHashes, await nativeArtifactHashes(inputRoots));
  for (const output of outputs) {
    if (!(await Bun.file(output).exists())) throw new Error(`Xcode finished without native output ${output}`);
  }
  const receipt = join(execution, "receipt.json");
  await Bun.write(receipt, JSON.stringify({ version: 1, startedAt, completedAt: new Date().toISOString(),
    simulator: device.udid, exitCode: 0, test: "PreviewTests/testSnapshots()", resultBundle, report: reportPath,
    inputs: inputHashes, outputs: await nativeArtifactHashes(outputs) }, null, 2));
  const artifactHashes = { ...inputHashes, ...await nativeArtifactHashes([logPath, reportPath, receipt, resultBundle]) };
  return { artifactHashes, simulator: device.udid };
}
