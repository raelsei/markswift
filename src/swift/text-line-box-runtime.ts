/** Actual native alignment guides and ideal height govern baseline placement and app reflow. */
export const TEXT_LINE_BOX_RUNTIME = `
struct MarkswiftTextLineBox: Layout {
    var firstBaseline: CGFloat
    var baselineToBottom: CGFloat
    var baselineStep: CGFloat
    var fontSize: CGFloat
    var fontWeight: CGFloat
    var lineSpacing: CGFloat
    var greedy: Bool = false
    var fallbackLeading: CGFloat = 0
    var horizontal: HorizontalAlignment = .leading
    var fixedHeight: CGFloat? = nil
    var expectedLines: Int? = nil
    var fixedWidth: CGFloat? = nil

    private struct Measurement {
        var size: CGSize
        var child: CGSize
        var offset: CGFloat
        var first: CGFloat
        var last: CGFloat
    }

    private func measure(_ proposal: ProposedViewSize, _ subview: LayoutSubview) -> Measurement {
        let dimensions = subview.dimensions(in: ProposedViewSize(width: fixedWidth ?? proposal.width, height: nil))
        let nativeFirst = dimensions[.firstTextBaseline], nativeLast = dimensions[.lastTextBaseline]
        let font = UIFont.systemFont(ofSize: fontSize, weight: UIFont.Weight(rawValue: fontWeight))
        let natural = font.ascender - font.descender + font.leading
        let stride = greedy ? baselineStep : natural + lineSpacing
        let rawCount = greedy ? (nativeLast - nativeFirst) / stride + 1 : (dimensions.height + lineSpacing) / stride
        let finite = stride.isFinite && stride > 0 && rawCount.isFinite && rawCount >= 0.5 && rawCount < 100_000
        let count = finite ? max(1, Int(rawCount.rounded())) : 1
        let expectedHeight = natural + CGFloat(count - 1) * stride
        // SwiftUI rounds ideal sizes and guides to device pixels. A bounded one-point guard
        // covers that rounding at every supported scale; it never changes font metrics.
        let valid = finite && abs(dimensions.height - expectedHeight) <= 1.001
            && nativeFirst.isFinite && nativeFirst >= 0 && nativeFirst <= dimensions.height
            && (!greedy || abs(nativeLast - nativeFirst - CGFloat(count - 1) * stride) <= 1.001)
            && (expectedLines == nil || expectedLines == count)
        let height = fixedHeight ?? (valid ? firstBaseline + CGFloat(count - 1) * baselineStep + baselineToBottom
                                          : dimensions.height + 2 * fallbackLeading)
        let offset = valid ? firstBaseline - nativeFirst : fixedHeight == nil ? fallbackLeading : (height - dimensions.height) / 2
        return Measurement(size: CGSize(width: fixedWidth ?? dimensions.width, height: max(0, height)),
                           child: CGSize(width: dimensions.width, height: dimensions.height), offset: offset,
                           first: nativeFirst + offset, last: nativeLast + offset)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let subview = subviews.first else { return .zero }
        return measure(proposal, subview).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let subview = subviews.first else { return }
        let width = fixedWidth ?? proposal.width ?? bounds.width
        let measured = measure(ProposedViewSize(width: width, height: nil), subview)
        let slack = bounds.width - measured.child.width
        let x = bounds.minX + (horizontal == .center ? slack / 2 : horizontal == .trailing ? slack : 0)
        subview.place(at: CGPoint(x: x, y: bounds.minY + measured.offset), anchor: .topLeading,
                      proposal: ProposedViewSize(width: width, height: measured.child.height))
    }

    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        guard let subview = subviews.first else { return nil }
        let measured = measure(ProposedViewSize(width: fixedWidth ?? proposal.width ?? bounds.width, height: nil), subview)
        if guide == .firstTextBaseline { return measured.first }
        if guide == .lastTextBaseline { return measured.last }
        return nil
    }
}
`;
