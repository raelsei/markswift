/// CSS flex row: grow / shrink / basis (px, nil = content, or a fraction of the row), min/max clamps, gaps, per-item
/// `align-self`; one line (a `flex-wrap` row captured on one line reflows here but never breaks).
struct MarkswiftFlexRow: Layout {
    struct Item: Sendable {
        var grow: CGFloat
        var shrink: CGFloat
        var basis: CGFloat?
        var min: CGFloat = 0
        var max: CGFloat? = nil
        /// Horizontal padding and border: the box's floor, excluded from the shrink weight.
        var inset: CGFloat = 0
        /// Percentage basis: `basis + fraction × width`.
        var fraction: CGFloat? = nil
        /// `align-self`, when it differs from the row's `align-items`.
        var align: Align? = nil
    }
    enum Align: Sendable { case start, center, end, stretch }
    var items: [Item]
    var spacing: CGFloat
    var align: Align = .stretch

    /// Pure allocation, the CSS flex freeze loop; `MarkswiftFlexRow.widths` and `solveFlexRow`
    /// (src/analysis/flex-row.ts) must agree.
    static func widths(width: CGFloat, items: [Item], bases: [CGFloat], spacing: CGFloat) -> [CGFloat] {
        func clamp(_ v: CGFloat, _ i: Int) -> CGFloat {
            Swift.max(items[i].min, items[i].inset, Swift.min(items[i].max ?? .infinity, v))
        }
        let base = bases.indices.map { i in
            items[i].fraction.map { Swift.max(items[i].inset, bases[i] + $0 * width) } ?? bases[i]
        }
        let space = width - CGFloat(Swift.max(0, items.count - 1)) * spacing
        let growing = base.indices.map { clamp(base[$0], $0) }.reduce(0, +) < space
        let factor = items.map { growing ? $0.grow : $0.shrink }
        let weight = items.indices.map { growing ? items[$0].grow : items[$0].shrink * Swift.max(0, base[$0] - items[$0].inset) }
        var size = base.indices.map { clamp(base[$0], $0) }
        var frozen = base.indices.map { factor[$0] == 0 || (growing ? base[$0] > size[$0] : base[$0] < size[$0]) }
        func left() -> CGFloat { space - base.indices.map { frozen[$0] ? size[$0] : base[$0] }.reduce(0, +) }
        let initial = left()
        // Each pass freezes at least one item; the bound only stops a non-finite measure from looping.
        for _ in 0...items.count where frozen.contains(false) {
            var free = left()
            let open = items.indices.filter { !frozen[$0] }
            let factors = open.map { factor[$0] }.reduce(0, +)
            if factors < 1 && abs(initial * factors) < abs(free) { free = initial * factors }
            let total = open.map { weight[$0] }.reduce(0, +)
            let violation = open.map { i in
                let target = base[i] + (total > 0 ? free * weight[i] / total : 0)
                size[i] = clamp(target, i)
                return size[i] - target
            }
            let sum = violation.reduce(0, +)
            for (k, i) in open.enumerated() where abs(sum) < 0.000001 || (sum > 0 ? violation[k] > 0 : violation[k] < 0) {
                frozen[i] = true
            }
        }
        return size
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
        // Without a width a percentage basis is indefinite: CSS sizes that item by its content.
        let ideal = subviews.indices.map { items[$0].fraction == nil ? b[$0] : subviews[$0].sizeThatFits(.unspecified).width }
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
            ?? ideal.reduce(0, +) + CGFloat(max(0, b.count - 1)) * spacing
        let w = Self.widths(width: width, items: items, bases: b, spacing: spacing)
        return CGSize(width: width, height: heights(w, proposal.height, subviews).max() ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = Self.widths(width: bounds.width, items: items, bases: bases(subviews), spacing: spacing)
        let h = heights(w, proposal.height, subviews)
        var x = bounds.minX
        for i in subviews.indices {
            let a = items[i].align ?? align
            let y = switch a {
            case .start, .stretch: bounds.minY
            case .center: bounds.minY + (bounds.height - h[i]) / 2
            case .end: bounds.maxY - h[i]
            }
            subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                              proposal: ProposedViewSize(width: w[i], height: a == .stretch ? bounds.height : h[i]))
            x += w[i] + spacing
        }
    }
}

/// CSS `fit-content` width: the content's ideal width, never wider than offered. App mode gives it to a box that hugs
/// its content in CSS but holds filling children, which would otherwise take every point a stack offers; unlike the
/// captured width it widens and narrows with native (Dynamic Type) text.
struct MarkswiftFitWidth: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let ideal = child.sizeThatFits(.unspecified).width
        return child.sizeThatFits(ProposedViewSize(width: min(ideal, proposal.width ?? ideal), height: proposal.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}

extension View {
    func markswiftFitWidth() -> some View { MarkswiftFitWidth { self } }
}
