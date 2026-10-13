struct MarkswiftMeasuredLayout: Layout {
    var width: CGFloat
    var height: CGFloat
    var frames: [CGRect]
    /// App mode: a child taller than its captured frame (Dynamic Type) moves every frame wholly below it down by the
    /// difference, and the layout grows with its lowest frame. Fidelity keeps the captured frames.
    var grows = false

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard grows else { return CGSize(width: width, height: height) }
        let bottom = frames.map(\.maxY).max() ?? 0
        let grown = placed(subviews).map(\.maxY).max() ?? 0
        return CGSize(width: width, height: height + max(0, grown - bottom))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, (subview, frame)) in zip(subviews, grows ? placed(subviews) : frames).enumerated() where index < frames.count {
            subview.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                          anchor: .topLeading, proposal: ProposedViewSize(width: frame.width, height: frame.height))
        }
    }

    /// Captured frames at the children's native heights, top to bottom: each moves down by the most any frame above it moved
    /// or grew. ponytail: O(n²) over the children; measured layouts hold a handful.
    private func placed(_ subviews: Subviews) -> [CGRect] {
        var out = frames
        for i in frames.indices.sorted(by: { frames[$0].minY < frames[$1].minY }) where i < subviews.count {
            let f = frames[i]
            let shift = frames.indices.filter { $0 != i && frames[$0].maxY <= f.minY + 0.5 }.map { out[$0].maxY - frames[$0].maxY }.max() ?? 0
            let fitted = subviews[i].sizeThatFits(ProposedViewSize(width: f.width, height: nil)).height
            out[i] = CGRect(x: f.minX, y: f.minY + max(0, shift), width: f.width, height: max(f.height, fitted))
        }
        return out
    }
}
