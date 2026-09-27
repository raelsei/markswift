/** Whole-string CoreText advances and the bounded CSS automatic-table distribution. */
export const TABLE_INTRINSIC_RUNTIME = `
nonisolated enum MarkswiftTableIntrinsic {
    struct Cell: Sendable {
        var column: Int
        var text: String
        var font: MarkswiftTableFont.Spec
        var horizontalInset: CGFloat
    }

    static func maximums(_ cells: [Cell], count: Int) -> [CGFloat] {
        var result = Array(repeating: CGFloat(0), count: count)
        for cell in cells {
            // UIFont/NSFont are accepted CoreText font attributes and retain the exact design.
            let value = NSAttributedString(string: cell.text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): MarkswiftTableFont.native(cell.font)])
            let line = CTLineCreateWithAttributedString(value as CFAttributedString)
            let advance = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            result[cell.column] = max(result[cell.column], max(0, advance) + cell.horizontalInset)
        }
        return result
    }

    static func columns(_ maximums: [CGFloat], available: CGFloat) -> [CGFloat] {
        let total = maximums.reduce(0, +)
        let width = max(available, total)
        return total > 0 ? maximums.map { $0 * width / total }
            : maximums.map { _ in width / CGFloat(max(1, maximums.count)) }
    }
}
`;

/** Mirrors the nearest named system weight and design emitted by fontExpr. */
export const TABLE_INTRINSIC_FONT_RUNTIME = `
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

nonisolated enum MarkswiftTableFont {
    struct Spec: Sendable {
        var size: CGFloat
        var weight: CGFloat
        var design: Int
    }
#if canImport(UIKit)
    typealias Weight = UIFont.Weight
    static func native(_ spec: Spec) -> NSObject {
        let font = UIFont.systemFont(ofSize: spec.size, weight: Weight(rawValue: spec.weight))
        let descriptor = spec.design == 1 ? font.fontDescriptor.withDesign(.rounded)
            : spec.design == 2 ? font.fontDescriptor.withDesign(.monospaced)
            : spec.design == 3 ? font.fontDescriptor.withDesign(.serif) : nil
        return descriptor.map { UIFont(descriptor: $0, size: spec.size) } ?? font
    }
#elseif canImport(AppKit)
    typealias Weight = NSFont.Weight
    static func native(_ spec: Spec) -> NSObject {
        let font = NSFont.systemFont(ofSize: spec.size, weight: Weight(rawValue: spec.weight))
        let descriptor = spec.design == 1 ? font.fontDescriptor.withDesign(.rounded)
            : spec.design == 2 ? font.fontDescriptor.withDesign(.monospaced)
            : spec.design == 3 ? font.fontDescriptor.withDesign(.serif) : nil
        return descriptor.flatMap { NSFont(descriptor: $0, size: spec.size) } ?? font
    }
#endif
    static func system(size: CGFloat, weight: Weight, design: Int) -> Spec {
        Spec(size: size, weight: weight.rawValue, design: design)
    }
}
`;
