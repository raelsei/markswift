import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseColor } from "../../src/css/color.ts";
import type { CompileResult, LayoutDoc } from "../../src/compiler/index.ts";

interface SimulatorInventory {
  devices: Record<string, Array<{ udid: string; name: string; state: string; isAvailable: boolean }>>;
}

const packageManifest = `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "MarkswiftVisualSmoke",
    platforms: [.iOS("18.0")],
    targets: [
        .target(name: "Generated", resources: [.copy("Fonts")]),
        .testTarget(name: "PreviewTests", dependencies: ["Generated"])
    ]
)
`;

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

function renderTest(name: string, layout: LayoutDoc, outputs: Record<number, string>): string {
  const color = parseColor(layout.canvas);
  if (!color) throw new Error(`Unsupported captured canvas color: ${layout.canvas}`);
  const height = layout.size.h;
  const renders = Object.entries(outputs).map(([width, output]) => `
        try snapshot(width: ${Number(width)}, height: ${height}, output: ${JSON.stringify(output)})`).join("");
  return `import XCTest
import SwiftUI
@testable import Generated

final class PreviewTests: XCTestCase {
    @MainActor
    func testSnapshots() throws {${renders}
    }

    @MainActor
    private func snapshot(width: CGFloat, height: CGFloat, output: String) throws {
        let content = ${name}()
            .frame(width: width, height: height, alignment: .topLeading)
            .background(Color(.sRGB, red: ${color.r}, green: ${color.g}, blue: ${color.b}, opacity: ${color.a}))
            .environment(\\.colorScheme, .light)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        renderer.proposedSize = ProposedViewSize(width: width, height: height)
        let image = try XCTUnwrap(renderer.uiImage, "SwiftUI did not render an image")
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: output))
    }
}
`;
}

/** Render both viewport widths from one measured and compiled 390-point Swift bundle. */
export async function renderVisualSnapshots(bundle: CompileResult, layout: LayoutDoc, outputs: Record<number, string>, work: string): Promise<void> {
  const inventory = JSON.parse(await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000)) as SimulatorInventory;
  const device = selectSimulator(inventory);
  const generated = join(work, "Sources", "Generated");
  const testDir = join(work, "Tests", "PreviewTests");
  await rm(generated, { recursive: true, force: true });
  await mkdir(join(generated, "Fonts"), { recursive: true });
  await mkdir(testDir, { recursive: true });
  await Bun.write(join(work, "Package.swift"), packageManifest);
  await Bun.write(join(generated, "Fonts", ".keep"), "");
  for (const [file, source] of Object.entries(bundle.files)) {
    if (file.endsWith(".swift")) await Bun.write(join(generated, file), source);
  }
  await Bun.write(join(generated, "MarkswiftPreviewResources.swift"), "import Foundation\nenum MarkswiftPreviewResources { static let bundle = Bundle.module }\n");
  await Bun.write(join(testDir, "PreviewTests.swift"), renderTest(bundle.name, layout, outputs));
  for (const output of Object.values(outputs)) await rm(output, { force: true });
  console.log(`Rendering generated Swift on ${device.name}…`);
  await command([
    "xcodebuild", "test", "-scheme", "MarkswiftVisualSmoke-Package", "-destination", `platform=iOS Simulator,id=${device.udid}`,
    "-derivedDataPath", join(work, ".build", "DerivedData"), "-parallel-testing-enabled", "NO",
    "-only-testing:PreviewTests/PreviewTests/testSnapshots", "-quiet",
  ], work);
  for (const output of Object.values(outputs)) {
    if (!(await Bun.file(output).exists())) throw new Error(`Xcode finished without native image ${output}`);
  }
}
