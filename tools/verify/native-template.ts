import type { ConversionResult } from "../../src/index.ts";
import { parseColor } from "../../src/css/color.ts";

/** States a harness forces on every element at once (`MarkswiftForcedStates` members). */
export type ForcedState = "pressed" | "focused" | "reduceMotion";

/** A conversion to render; `openArg` renders it with that in-flow layer's `init` label set (`V(isMoreExpanded: true)`). */
export type RenderResult = ConversionResult & { openArg?: string };

/** Size, canvas colour and theme of the render, shared by the iOS and macOS templates. */
export function canvas(result: ConversionResult) {
  const { w, h } = result.layout.size;
  if (![w, h].every((n) => Number.isFinite(n) && n > 0 && n <= 4096)) {
    throw new Error("Measured component size must be 1–4096 px; constrain the HTML width/height.");
  }
  const color = parseColor(result.layout.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  return { w, h, color, dark: result.layout.combo.theme === "dark" };
}

/** `Info.plist` of the iOS render app: a scene-based simulator app (`Render.SceneDelegate`) with bundle id `com.markswift.render`.
 * iPhone and iPad (full window, any orientation but upside-down: wide jobs rotate the iPad to landscape). */
export const renderAppPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key><string>com.markswift.render</string>
    <key>CFBundleExecutable</key><string>Render</string>
    <key>CFBundleName</key><string>Render</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>MinimumOSVersion</key><string>18.0</string>
    <key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
    <key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UIRequiresFullScreen</key><true/>
    <key>UILaunchScreen</key><dict/>
    <key>UIApplicationSceneManifest</key>
    <dict>
        <key>UIApplicationSupportsMultipleScenes</key><false/>
        <key>UISceneConfigurations</key>
        <dict>
            <key>UIWindowSceneSessionRoleApplication</key>
            <array>
                <dict>
                    <key>UISceneConfigurationName</key><string>Default</string>
                    <key>UISceneDelegateClassName</key><string>Render.SceneDelegate</string>
                </dict>
            </array>
        </dict>
    </dict>
</dict>
</plist>
`;

/** `RenderJob` (one `jobs.json` entry) and `jobView(i)` (view `i` is `results[i]`), shared by both render mains. */
function jobDeclarations(results: RenderResult[]): string {
  for (const result of results) canvas(result);
  const cases = results
    .map((result, i) => `    case ${i}: AnyView(${result.name}(${result.openArg ? `${result.openArg}: true` : ""}))`)
    .join("\n");
  return `struct RenderJob: Decodable {
    let view: Int, w: Double, h: Double, dark: Bool, r: Double, g: Double, b: Double, a: Double
    let assets: String, output: String
    /// Seconds into every animation (absent = settled); MarkswiftForcedStates raw value.
    let time: Double?, forced: Int?
}

func jobView(_ index: Int) -> AnyView {
    switch index {
${cases}
    default: fatalError("unknown view \\(index)")
    }
}
`;
}

/**
 * `RenderApp.swift` of the iOS render app: hosts each job's view in a `UIHostingController` inside the
 * key window and captures it with `drawHierarchy`, which (unlike ImageRenderer) draws UIKit-backed
 * controls. Jobs come from the JSON file passed as the first launch argument; view `i` is `results[i]`.
 */
export function renderAppMain(results: RenderResult[]): string {
  return `import CoreText
import SwiftUI
import UIKit

${jobDeclarations(results)}
@main
final class RenderApp: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIViewController()
        window.makeKeyAndVisible()
        self.window = window
        let path = ProcessInfo.processInfo.arguments[1]
        Task {
            do {
                let jobs = try JSONDecoder().decode([RenderJob].self, from: Data(contentsOf: URL(fileURLWithPath: path)))
                for job in jobs {
                    let fits = { job.w <= window.bounds.width && job.h <= window.bounds.height }
                    // A job that fits the window only turned (a wide one on the iPad): rotate the scene, then wait for it.
                    if !fits(), job.w <= window.bounds.height, job.h <= window.bounds.width {
                        window.rootViewController!.setNeedsUpdateOfSupportedInterfaceOrientations()
                        scene.requestGeometryUpdate(.iOS(interfaceOrientations: job.w > job.h || job.w > window.bounds.width ? .landscapeRight : .portrait)) { error in
                            print("rotate \\(job.view): \\(error)")
                        }
                        var waited = 0
                        while !fits(), waited < 60 {
                            try await Task.sleep(for: .milliseconds(50))
                            waited += 1
                        }
                    }
                    guard fits() else {
                        print("error \\(job.view): \\(job.w)x\\(job.h) exceeds the \\(window.bounds.size) window; drawHierarchy renders on-screen content only")
                        continue
                    }
                    // Fonts and Images/ exactly as macRenderMain: from the job's asset directory, one job at a time.
                    let assets = URL(fileURLWithPath: job.assets)
                    let fonts = ((try? FileManager.default.contentsOfDirectory(at: assets.appendingPathComponent("Fonts"), includingPropertiesForKeys: nil)) ?? [])
                        .filter { $0.pathExtension == "ttf" || $0.pathExtension == "otf" }
                    MarkswiftFonts.register(urls: fonts)
                    MarkswiftAssets.bundle = Bundle(url: assets) ?? .main
                    let host = UIHostingController(rootView: jobView(job.view)
                        .frame(width: job.w, height: job.h, alignment: .topLeading)
                        .background(Color(.sRGB, red: job.r, green: job.g, blue: job.b, opacity: job.a))
                        .environment(\\.colorScheme, job.dark ? .dark : .light)
                        .environment(\\.markswiftMotionTime, job.time ?? .infinity)
                        .environment(\\.markswiftForcedStates, MarkswiftForcedStates(rawValue: job.forced ?? 0)))
                    host.safeAreaRegions = []
                    host.overrideUserInterfaceStyle = job.dark ? .dark : .light
                    host.view.frame = CGRect(x: 0, y: 0, width: job.w, height: job.h)
                    window.rootViewController!.addChild(host)
                    window.rootViewController!.view.addSubview(host.view)
                    host.didMove(toParent: window.rootViewController)
                    host.view.layoutIfNeeded()
                    // One display cycle so UIKit-backed controls (text fields, scroll views) are on screen.
                    try await Task.sleep(for: .milliseconds(100))
                    let format = UIGraphicsImageRendererFormat()
                    format.scale = 2
                    let image = UIGraphicsImageRenderer(bounds: host.view.bounds, format: format).image { _ in
                        _ = host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
                    }
                    try image.pngData()!.write(to: URL(fileURLWithPath: job.output))
                    host.willMove(toParent: nil)
                    host.view.removeFromSuperview()
                    host.removeFromParent()
                    // A later job may bundle a different file under the same PostScript name.
                    for url in fonts { CTFontManagerUnregisterFontsForURL(url as CFURL, .process, nil) }
                    print("rendered \\(job.view)")
                }
                exit(0)
            } catch {
                print("render failed: \\(error)")
                exit(1)
            }
        }
    }
}
`;
}

/**
 * `main.swift` of the macOS command-line renderer: SwiftUI `ImageRenderer`, without a simulator. One build serves a
 * whole batch; each run renders one job (`render <jobs.json> <index>`), so nothing carries over from another job's
 * render. Fonts register from the job's `Fonts/`; `Images/` resolves next to it. ImageRenderer cannot draw
 * UIKit/AppKit-backed controls.
 */
export function macRenderMain(results: RenderResult[]): string {
  return `import AppKit
import SwiftUI

${jobDeclarations(results)}
let jobs = try JSONDecoder().decode([RenderJob].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let job = jobs[Int(CommandLine.arguments[2])!]
let assets = URL(fileURLWithPath: job.assets)
let fonts = (try? FileManager.default.contentsOfDirectory(at: assets.appendingPathComponent("Fonts"), includingPropertiesForKeys: nil)) ?? []
MarkswiftFonts.register(urls: fonts.filter { $0.pathExtension == "ttf" || $0.pathExtension == "otf" })
MarkswiftAssets.bundle = Bundle(url: assets) ?? .main
NSApplication.shared.appearance = NSAppearance(named: job.dark ? .darkAqua : .aqua)
let renderer = ImageRenderer(content: jobView(job.view)
    .frame(width: job.w, height: job.h, alignment: .topLeading)
    .background(Color(.sRGB, red: job.r, green: job.g, blue: job.b, opacity: job.a))
    .environment(\\.colorScheme, job.dark ? .dark : .light)
    .environment(\\.markswiftMotionTime, job.time ?? .infinity)
    .environment(\\.markswiftForcedStates, MarkswiftForcedStates(rawValue: job.forced ?? 0)))
renderer.scale = 2
renderer.proposedSize = ProposedViewSize(width: job.w, height: job.h)
guard let image = renderer.cgImage else {
    print("error \\(job.view): SwiftUI produced no image")
    exit(1)
}
try NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: job.output))
`;
}
