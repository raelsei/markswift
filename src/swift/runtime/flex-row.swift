/// CSS flex row: grow / shrink / basis (px, or nil = content), gaps; no wrap, no min/max.
struct MarkswiftFlexRow: Layout {
    struct Item: Sendable { var grow: CGFloat; var shrink: CGFloat; var basis: CGFloat? }
    enum Align: Sendable { case start, center, end, stretch }
    var items: [Item]
    var spacing: CGFloat
    var align: Align = .stretch

    /// Pure allocation; `MarkswiftFlexRow.widths` and `solveFlexRow` (src/analysis/flex-row.ts) must agree.
    static func widths(width: CGFloat, items: [Item], bases: [CGFloat], spacing: CGFloat) -> [CGFloat] {
        let free = width - bases.reduce(0, +) - CGFloat(max(0, items.count - 1)) * spacing
        if free >= 0 {
            let g = items.map(\.grow).reduce(0, +)
            return bases.indices.map { g > 0 ? bases[$0] + free * items[$0].grow / max(1, g) : bases[$0] }
        }
        let s = bases.indices.map { items[$0].shrink * bases[$0] }.reduce(0, +)
        return bases.indices.map { s > 0 ? max(0, bases[$0] + free * items[$0].shrink * bases[$0] / s) : bases[$0] }
    }

    private func bases(_ subviews: Subviews) -> [CGFloat] {
        precondition(items.count == subviews.count, "MarkswiftFlexRow items/subviews mismatch")
        return subviews.indices.map { items[$0].basis ?? subviews[$0].sizeThatFits(.unspecified).width }
    }

    private func heights(_ w: [CGFloat], _ height: CGFloat?, _ subviews: Subviews) -> [CGFloat] {
        subviews.indices.map { subviews[$0].sizeThatFits(ProposedViewSize(width: w[$0], height: height)).height }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let b = bases(subviews)
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
            ?? b.reduce(0, +) + CGFloat(max(0, b.count - 1)) * spacing
        let w = Self.widths(width: width, items: items, bases: b, spacing: spacing)
        return CGSize(width: width, height: heights(w, proposal.height, subviews).max() ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = Self.widths(width: bounds.width, items: items, bases: bases(subviews), spacing: spacing)
        let h = align == .stretch ? [] : heights(w, proposal.height, subviews)
        var x = bounds.minX
        for i in subviews.indices {
            let y = switch align {
            case .start, .stretch: bounds.minY
            case .center: bounds.minY + (bounds.height - h[i]) / 2
            case .end: bounds.maxY - h[i]
            }
            subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                              proposal: ProposedViewSize(width: w[i], height: align == .stretch ? bounds.height : h[i]))
            x += w[i] + spacing
        }
    }
}
