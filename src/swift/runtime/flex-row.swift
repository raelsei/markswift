/// CSS flex row: grow / shrink / basis (px, nil = content, or a fraction of the row), min/max clamps, gaps, per-item
/// `align-self`; with `rowGap` (`flex-wrap: wrap`) items break into lines, each allocated on its own.
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
    /// `flex-wrap: wrap`: the gap between lines; nil keeps one line (nowrap).
    var rowGap: CGFloat? = nil

    /// Line breaks (css-flexbox §9.3), mirroring `flexLines` (src/analysis/flex-row.ts): an item starts a new line
    /// when its clamped base no longer fits after the previous ones and their gaps.
    static func lines(width: CGFloat, items: [Item], bases: [CGFloat], spacing: CGFloat) -> [Range<Int>] {
        var out: [Range<Int>] = []
        var start = 0
        var used: CGFloat = 0
        for i in bases.indices {
            let it = items[i]
            let base = it.fraction.map { Swift.max(it.inset, bases[i] + $0 * width) } ?? bases[i]
            let size = Swift.max(it.min, it.inset, Swift.min(it.max ?? .infinity, base))
            let next = i == start ? size : used + spacing + size
            if i > start && next > width + 0.01 {
                out.append(start..<i)
                start = i
                used = size
            } else {
                used = next
            }
        }
        if start < bases.count { out.append(start..<bases.count) }
        return out
    }

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

    /// Widths, heights and lines at `width`; a wrapping row's items are measured without the row's height.
    private func plan(_ width: CGFloat, _ height: CGFloat?, _ subviews: Subviews)
        -> (w: [CGFloat], h: [CGFloat], lines: [Range<Int>], lineHeights: [CGFloat]) {
        let b = bases(subviews)
        let lines = rowGap == nil ? [0..<b.count] : Self.lines(width: width, items: items, bases: b, spacing: spacing)
        var w = [CGFloat](repeating: 0, count: b.count)
        for l in lines {
            let lw = Self.widths(width: width, items: Array(items[l]), bases: Array(b[l]), spacing: spacing)
            for (k, i) in l.enumerated() { w[i] = lw[k] }
        }
        let h = heights(w, rowGap == nil ? height : nil, subviews)
        return (w, h, lines, lines.map { l in l.map { h[$0] }.max() ?? 0 })
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let b = bases(subviews)
        // Without a width the row is as wide as its items' max-content contributions (CSS fit-content): a growing or
        // content-sized item its content, never less than its clamped base; a percentage basis is indefinite there.
        let ideal = subviews.indices.map { i -> CGFloat in
            let it = items[i]
            let content = subviews[i].sizeThatFits(.unspecified).width
            if it.fraction != nil { return content }
            let base = Swift.max(it.min, it.inset, Swift.min(it.max ?? .infinity, b[i]))
            return it.grow > 0 || it.basis == nil ? Swift.max(base, Swift.min(it.max ?? .infinity, content)) : base
        }
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
            ?? ideal.reduce(0, +) + CGFloat(max(0, b.count - 1)) * spacing
        let p = plan(width, proposal.height, subviews)
        guard let rowGap else { return CGSize(width: width, height: p.h.max() ?? 0) }
        return CGSize(width: width, height: p.lineHeights.reduce(0, +) + CGFloat(max(0, p.lines.count - 1)) * rowGap)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let p = plan(bounds.width, proposal.height, subviews)
        var y = bounds.minY
        for (n, l) in p.lines.enumerated() {
            // One nowrap line is the row's height; a wrapping line its tallest item's.
            let lineHeight = rowGap == nil ? bounds.height : p.lineHeights[n]
            var x = bounds.minX
            for i in l {
                let a = items[i].align ?? align
                let dy: CGFloat = switch a {
                case .start, .stretch: 0
                case .center: (lineHeight - p.h[i]) / 2
                case .end: lineHeight - p.h[i]
                }
                subviews[i].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                                  proposal: ProposedViewSize(width: p.w[i], height: a == .stretch ? lineHeight : p.h[i]))
                x += p.w[i] + spacing
            }
            y += lineHeight + (rowGap ?? 0)
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
