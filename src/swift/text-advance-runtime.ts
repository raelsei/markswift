/** Fractional advances of the very same native font used to render admitted word text. */
export const TEXT_ADVANCE_RUNTIME = `
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

nonisolated enum MarkswiftTextAdvance {
#if canImport(UIKit)
    typealias NativeFont = UIFont
#else
    typealias NativeFont = NSFont
#endif
    static func width(_ value: String, font: NativeFont) -> CGFloat {
        let attributed = NSAttributedString(string: value, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
        return CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(attributed as CFAttributedString), nil, nil, nil))
    }
}
`;
