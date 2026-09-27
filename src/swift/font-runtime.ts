/** Exact bundled-font resolver for fidelity. App fonts retain their Dynamic Type route. */
export const FONT_RUNTIME = `import UIKit

enum MarkswiftBundledFont {
    /// Public static face names come from the packaged source catalog, never nearest traits.
    /// Source or live variable axes always retain the existing family/variation descriptor.
    nonisolated static func resolve(_ family: String, size: CGFloat, weight: CGFloat, opsz: CGFloat? = nil, staticFace: String? = nil) -> UIFont {
        var axes: [Int: CGFloat] = [0x7767_6874: weight] // 'wght'
        if let opsz { axes[0x6F70_737A] = opsz }          // 'opsz'
        let attrs: [UIFontDescriptor.AttributeName: Any] = [
            .family: family,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): axes,
        ]
        let descriptor = UIFontDescriptor(fontAttributes: attrs)
        let original = UIFont(descriptor: descriptor, size: size)
        if let liveAxes = CTFontCopyVariationAxes(original as CTFont), CFArrayGetCount(liveAxes) > 0 {
            return original
        }
        guard let staticFace, let selected = UIFont(name: staticFace, size: size) else { return original }
        // Defensive source/registration mismatch: never replace a variable instance with a name.
        if let liveAxes = CTFontCopyVariationAxes(selected as CTFont), CFArrayGetCount(liveAxes) > 0 {
            return original
        }
        return selected
    }
}

extension SwiftUI.Font {
    nonisolated static func markswiftVariable(_ family: String, size: CGFloat, weight: CGFloat, opsz: CGFloat? = nil, staticFace: String? = nil) -> SwiftUI.Font {
        SwiftUI.Font(MarkswiftBundledFont.resolve(family, size: size, weight: weight, opsz: opsz, staticFace: staticFace))
    }
}
`;
