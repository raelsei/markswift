/// Plain wrapping paragraphs use UIKit's public word-wrap strategy on iOS 26+; SwiftUI Text
/// enables orphan avoidance with no public switch. Rich runs retain the SwiftUI text pipeline.
struct MarkswiftGreedyText: View {
    let text: String
    let font: Font
    let color: Color
    let size: CGFloat
    let style: Font.TextStyle
    let lineHeight: CGFloat
    let ascent: CGFloat
    let descent: CGFloat
    let natural: CGFloat
    var lineLimit: Int? = nil
    var body: some View {
        #if os(iOS)
        if #available(iOS 26.0, *) {
            MarkswiftGreedyLabel(text: text, font: font, color: color, size: size, lineHeight: lineHeight, ascent: ascent, descent: descent, lineLimit: lineLimit)
        } else { fallback }
        #else
        fallback
        #endif
    }
    private var fallback: some View {
        Text(verbatim: text).font(font).foregroundStyle(color)
            .lineLimit(lineLimit)
            .fixedSize(horizontal: false, vertical: true)
            .markswiftLineHeight(lineHeight, size: size, relativeTo: style,
                                 ascent: ascent, descent: descent, natural: natural)
    }
}
#if os(iOS)
@available(iOS 26.0, *)
private struct MarkswiftGreedyLabel: UIViewRepresentable {
    let text: String
    let font: Font
    let color: Color
    let size: CGFloat
    let lineHeight: CGFloat
    let ascent: CGFloat
    let descent: CGFloat
    let lineLimit: Int?
    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }
    func updateUIView(_ label: UILabel, context: Context) {
        label.numberOfLines = lineLimit ?? 0
        label.lineBreakMode = lineLimit == nil ? .byWordWrapping : .byTruncatingTail
        let resolved = font.resolve(in: context.environment.fontResolutionContext)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.lineBreakStrategy = []
        paragraph.minimumLineHeight = lineHeight * resolved.pointSize / size
        paragraph.maximumLineHeight = paragraph.minimumLineHeight
        // A fixed-height UIKit paragraph puts its baseline at the line height minus the native descent, rounded to the
        // nearest device pixel; the offset then moves it to the CSS baseline (Blink's rounded ascent/descent around the
        // split leading). Measured on iOS 27 (SF 11–24 pt, six line-height ratios, fractional origins): this lands
        // within 0.01 pt of the SwiftUI fallback, which draws on the CSS baseline.
        let scale = context.environment.displayScale
        let nativeBaseline = ((paragraph.minimumLineHeight - CTFontGetDescent(resolved.ctFont)) * scale).rounded() / scale
        let cssBaseline = (lineHeight / size + ascent - descent) * resolved.pointSize / 2
        let baselineOffset = nativeBaseline - cssBaseline
        // TMP probe: remove before merge.
        if let h = FileHandle(forWritingAtPath: "/tmp/markswift-greedy.txt") {
            h.seekToEndOfFile()
            h.write("\(text.prefix(24)) pt \(resolved.pointSize) size \(size) lh \(lineHeight) desc \(CTFontGetDescent(resolved.ctFont)) scale \(scale) native \(nativeBaseline) css \(cssBaseline) offset \(baselineOffset) frame \(label.convert(label.bounds, to: nil))\n".data(using: .utf8)!)
            h.closeFile()
        }
        let rgba = color.resolve(in: context.environment)
        label.attributedText = NSAttributedString(string: text, attributes: [
            .font: resolved.ctFont,
            .foregroundColor: UIColor(red: CGFloat(rgba.red), green: CGFloat(rgba.green), blue: CGFloat(rgba.blue), alpha: CGFloat(rgba.opacity)),
            .paragraphStyle: paragraph,
            .baselineOffset: baselineOffset,
        ])
        label.accessibilityLabel = text
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        uiView.sizeThatFits(CGSize(width: proposal.width ?? CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
    }
}
#endif
