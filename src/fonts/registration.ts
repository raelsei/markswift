import type { PackagedFace } from "./types.ts";
import { GENERATED_BY } from "../model/version.ts";

/** `UIAppFonts` array for `Info.plist` — the app-target half of loading a bundled font. */
export function plistFragment(files: string[]): string {
  if (!files.length) return "";
  return [
    `<!-- ${GENERATED_BY} — merge into the app target's Info.plist. -->`,
    "<key>UIAppFonts</key>",
    "<array>",
    ...files.map((f) => `    <string>Fonts/${f}</string>`),
    "</array>",
    "",
  ].join("\n");
}

/**
 * `<View>+Fonts.swift`: the runtime half. `UIAppFonts` only works for a real app bundle, so the
 * generated code registers the same files with CoreText — the mechanism the render harness
 * already uses (`MarkswiftFonts.register`), reused rather than duplicated, so a generated view renders
 * identically in the harness, in `#Preview` and in the app. Nested in the view type
 * (`<View>.BundledFonts`) so several conversions coexist in one target. Without `owner` it is the
 * module-level `public enum BundledFonts` of a generated library package (`markswift build`), which
 * reads `Bundle.module` itself: a public default argument cannot name the internal `Bundle.module`.
 */
export function registrationSwift(faces: PackagedFace[], owner?: string): string {
  const pad = owner === undefined ? "" : "    ";
  const entries = faces
    .map((f) => f.file)
    .sort()
    .map((f) => `${pad}        ${JSON.stringify(f)},`)
    .join("\n");
  const doc = faces
    .map(
      (f) =>
        `/// - ${f.family} (${f.file}): weight ${f.weight[0]}–${f.weight[1]}${f.axes["wght"] ? ", variable wght" : ""}${f.converted ? ", converted from WOFF2" : ""}${f.renamed ? ", name table rewritten so the CSS family name resolves" : ""}`,
    )
    .join("\n");
  const register =
    `let urls = files.compactMap { bundle.url(forResource: "Fonts/" + $0, withExtension: nil) ?? bundle.url(forResource: $0, withExtension: nil) }
var error: Unmanaged<CFError>?
for url in urls {
    // \`kCTFontManagerErrorAlreadyRegistered\` (105) is expected when \`UIAppFonts\`
    // already loaded the file; every other failure would mean text renders in the
    // system font, so it is surfaced instead of ignored.
    if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let taken = error?.takeRetainedValue() {
        let code = CFErrorGetCode(taken)
        if code != 105 { print("[markswift] font registration failed: \\(url.lastPathComponent) (\\(code))") }
        error = nil
    }
}`
      .split("\n")
      .map((line) => `${pad}        ${line}`)
      .join("\n");
  if (owner === undefined)
    return `// ${GENERATED_BY} — bundled webfaces of this library.
import CoreText
import SwiftUI

${doc}
public enum BundledFonts {
    /// File names under the \`Fonts/\` resource directory, in bundle order.
    static let files: [String] = [
${entries}
    ]

    /// Registers every bundled face with CoreText, once per process. Call once at app launch
    /// (previews call it themselves).
    public static func register() {
        guard !registered else { return }
        registered = true
        let bundle = Bundle.module
${register}
    }

    private nonisolated(unsafe) static var registered = false
}
`;
  return `// ${GENERATED_BY} — bundled webfaces of ${owner}.
import CoreText
import SwiftUI

${doc}
extension ${owner} {
    enum BundledFonts {
        /// File names under the \`Fonts/\` resource directory, in bundle order.
        static let files: [String] = [
${entries}
        ]

        /// Registers every bundled face with CoreText, once per process. \`UIAppFonts\` covers the
        /// app target; this covers previews, tests and any target that loads the views from a
        /// package, where no \`Info.plist\` is read.
        static func register(in bundle: Bundle = .main) {
            guard !registered else { return }
            registered = true
${register}
        }

        private nonisolated(unsafe) static var registered = false
    }
}
`;
}
