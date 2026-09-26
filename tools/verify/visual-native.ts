import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseColor } from "../../src/css/color.ts";
import type { CompileResult, LayoutDoc } from "../../src/compiler/index.ts";

interface SimulatorInventory {
  devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
}

export interface VisualSnapshot {
  bundle: Pick<CompileResult, "name" | "files">;
  layout: LayoutDoc;
  outputs: Record<number, string>;
  /** UIKit-backed controls require a mounted view; ImageRenderer omits them. */
  hosted?: boolean;
}

function packageManifest(modules: string[]): string {
  return `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "MarkswiftVisualSmoke",
    platforms: [.iOS("18.0")],
    targets: [
${modules.map(name => `        .target(name: "${name}", resources: [.copy("Fonts")]),`).join("\n")}
        .testTarget(name: "PreviewTests", dependencies: [${modules.map(name => `"${name}"`).join(", ")}])
    ]
)
`;
}

async function command(args: string[], cwd?: string, timeoutMs = 300_000): Promise<string> {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    const output = stdout + stderr;
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

function renderTest(snapshots: VisualSnapshot[], modules: string[]): string {
  const renders = snapshots.flatMap(({ bundle, layout, outputs, hosted }) => {
    const color = parseColor(layout.canvas);
    if (!color) throw new Error(`Unsupported captured canvas color: ${layout.canvas}`);
    return Object.entries(outputs).map(([width, output]) => `
        try ${hosted ? "hostedSnapshot" : "snapshot"}(content: ${bundle.name}(), width: ${Number(width)}, height: ${layout.size.h},
                     canvas: Color(.sRGB, red: ${color.r}, green: ${color.g}, blue: ${color.b}, opacity: ${color.a}),
                     scheme: .${layout.combo.theme}, output: ${JSON.stringify(output)})`);
  }).join("");
  return `import XCTest
import SwiftUI
import UIKit
${modules.map(name => `@testable import ${name}`).join("\n")}

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
export async function renderVisualSnapshots(snapshots: VisualSnapshot[], work: string): Promise<void> {
  if (!snapshots.length) throw new Error("Visual rendering needs at least one compiled snapshot");
  const modules = snapshots.map((_, index) => `Generated${index}`);
  const outputs = snapshots.flatMap(snapshot => Object.values(snapshot.outputs));
  if (new Set(outputs).size !== outputs.length) throw new Error("Visual output paths must be distinct");
  const inventory = JSON.parse(await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000)) as SimulatorInventory;
  const device = selectSimulator(inventory);
  const testDir = join(work, "Tests", "PreviewTests");
  await rm(join(work, "Sources"), { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await Bun.write(join(work, "Package.swift"), packageManifest(modules));
  for (const [index, snapshot] of snapshots.entries()) {
    const generated = join(work, "Sources", modules[index]!);
    await mkdir(join(generated, "Fonts"), { recursive: true });
    await Bun.write(join(generated, "Fonts", ".keep"), "");
    for (const [file, source] of Object.entries(snapshot.bundle.files)) {
      if (file.endsWith(".swift")) await Bun.write(join(generated, file), source);
    }
    await Bun.write(join(generated, "MarkswiftPreviewResources.swift"), "import Foundation\nenum MarkswiftPreviewResources { static let bundle = Bundle.module }\n");
  }
  await Bun.write(join(testDir, "PreviewTests.swift"), renderTest(snapshots, modules));
  for (const output of outputs) await rm(output, { force: true });
  console.log(`Rendering generated Swift on ${device.name}…`);
  await command([
    "xcodebuild", "test", "-scheme", "MarkswiftVisualSmoke-Package", "-destination", `platform=iOS Simulator,id=${device.udid}`,
    "-derivedDataPath", join(work, ".build", "DerivedData"), "-parallel-testing-enabled", "NO",
    "-only-testing:PreviewTests/PreviewTests/testSnapshots", "-quiet",
  ], work);
  for (const output of outputs) {
    if (!(await Bun.file(output).exists())) throw new Error(`Xcode finished without native image ${output}`);
  }
}
