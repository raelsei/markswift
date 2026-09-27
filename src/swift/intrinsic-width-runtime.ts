/** Pure sizing expression; live parent proposals still determine the used box width. */
export const INTRINSIC_WIDTH_RUNTIME = `
nonisolated indirect enum MarkswiftIntrinsicWidth {
    case fixed(CGFloat)
    case words([String], size: CGFloat, weight: CGFloat)
    case maximum([MarkswiftIntrinsicWidth])
    case inset(CGFloat, MarkswiftIntrinsicWidth)

    var value: CGFloat {
        switch self {
        case let .fixed(width): return width
        case let .words(words, size, weight):
            let font = MarkswiftTextAdvance.NativeFont.systemFont(ofSize: size, weight: .init(rawValue: weight))
            return words.map { MarkswiftTextAdvance.width($0, font: font) }.max() ?? 0
        case let .maximum(children): return children.map(\\.value).max() ?? 0
        case let .inset(inset, content): return inset + content.value
        }
    }
}
`;
