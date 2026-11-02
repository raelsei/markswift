/// CSS flex row or column: grow / shrink / basis (px, nil = content, or a fraction of the container), min/max clamps,
/// gaps, per-item `align-self`; with `rowGap` (`flex-wrap: wrap`) items break into lines, each allocated on its own,
/// with `alignContent` distributing lines in a taller container.
struct MarkswiftFlexRow: Layout {
    struct Item: Sendable {
        var grow: CGFloat
        var shrink: CGFloat
        var basis: CGFloat?
        var min: CGFloat = 0
        var max: CGFloat? = nil
        /// Horizontal (or vertical for column) padding and border: the box's floor, excluded from the shrink weight.
        var inset: CGFloat = 0
        /// Percentage basis: `basis + fraction × mainAvailable`.
        var fraction: CGFloat? = nil
        /// `align-self`, when it differs from the container's `align-items`.
        var align: Align? = nil
        /// CSS `min-width: auto` / `min-height: auto`: probed natively when shrinking.
        var autoMin: Bool = false
    }
    enum Align: Sendable { case start, center, end, stretch }
    enum AlignContent: Sendable { case start, center, end, spaceBetween, spaceAround, spaceEvenly, stretch }
    enum Axis: Sendable { case horizontal, vertical }

    var axis: Axis = .horizontal
    var items: [Item]
    var spacing: CGFloat
    var align: Align = .stretch
    var alignContent: AlignContent = .stretch
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

    /// `align-content` line distribution in a taller cross axis, mirroring `flexAlignContent`
    /// (src/analysis/flex-row.ts).
    static func alignContentDistribution(
        alignContent: AlignContent,
        lineCrossSizes: [CGFloat],
        availableCross: CGFloat,
        gap: CGFloat
    ) -> (offsets: [CGFloat], lineCrossSizes: [CGFloat]) {
        let count = lineCrossSizes.count
        let total = lineCrossSizes.reduce(0, +) + CGFloat(Swift.max(0, count - 1)) * gap
        let slack = availableCross - total
        var offsets = [CGFloat]()
        var sizes = lineCrossSizes
        if count <= 1 || slack <= 0.5 {
            var y: CGFloat = 0
            for s in lineCrossSizes { offsets.append(y); y += s + gap }
            return (offsets, sizes)
        }
        switch alignContent {
        case .start:
            var y: CGFloat = 0
            for s in lineCrossSizes { offsets.append(y); y += s + gap }
        case .end:
            var y: CGFloat = slack
            for s in lineCrossSizes { offsets.append(y); y += s + gap }
        case .center:
            var y: CGFloat = slack / 2
            for s in lineCrossSizes { offsets.append(y); y += s + gap }
        case .spaceBetween:
            let extra = slack / CGFloat(count - 1)
            var y: CGFloat = 0
            for s in lineCrossSizes { offsets.append(y); y += s + gap + extra }
        case .spaceAround:
            let unit = slack / CGFloat(count)
            var y: CGFloat = unit / 2
            for s in lineCrossSizes { offsets.append(y); y += s + gap + unit }
        case .spaceEvenly:
            let unit = slack / CGFloat(count + 1)
            var y: CGFloat = unit
            for s in lineCrossSizes { offsets.append(y); y += s + gap + unit }
        case .stretch:
            let extra = slack / CGFloat(count)
            sizes = lineCrossSizes.map { $0 + extra }
            var y: CGFloat = 0
            for s in sizes { offsets.append(y); y += s + gap }
        }
        return (offsets, sizes)
    }

    private func main(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.width : size.height }
    private func cross(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.height : size.width }
    private func makeSize(main: CGFloat, cross: CGFloat) -> CGSize {
        axis == .horizontal ? CGSize(width: main, height: cross) : CGSize(width: cross, height: main)
    }
    private func makePoint(main: CGFloat, cross: CGFloat) -> CGPoint {
        axis == .horizontal ? CGPoint(x: main, y: cross) : CGPoint(x: cross, y: main)
    }
    private func mainProposal(main: CGFloat?, cross: CGFloat?) -> ProposedViewSize {
        axis == .horizontal ? ProposedViewSize(width: main, height: cross) : ProposedViewSize(width: cross, height: main)
    }
    private func zeroProposal() -> ProposedViewSize {
        axis == .horizontal ? ProposedViewSize(width: 0, height: nil) : ProposedViewSize(width: nil, height: 0)
    }

    private func bases(_ subviews: Subviews) -> [CGFloat] {
        precondition(items.count == subviews.count, "MarkswiftFlexRow items/subviews mismatch")
        return subviews.indices.map { items[$0].basis ?? main(subviews[$0].sizeThatFits(.unspecified)) }
    }

    private func crossSizes(_ m: [CGFloat], _ c: CGFloat?, _ subviews: Subviews) -> [CGFloat] {
        subviews.indices.map { cross(subviews[$0].sizeThatFits(mainProposal(main: m[$0], cross: c))) }
    }

    /// Sizes, lines and line cross sizes at `mainAvailable`.
    private func plan(_ mainAvailable: CGFloat, _ crossAvailable: CGFloat?, _ subviews: Subviews)
        -> (main: [CGFloat], cross: [CGFloat], lines: [Range<Int>], lineCrossSizes: [CGFloat]) {
        let b = bases(subviews)
        let lines = rowGap == nil ? [0..<b.count] : Self.lines(width: mainAvailable, items: items, bases: b, spacing: spacing)
        var m = [CGFloat](repeating: 0, count: b.count)
        for l in lines {
            var lineItems = Array(items[l])
            let lineBases = Array(b[l])
            let space = mainAvailable - CGFloat(Swift.max(0, lineItems.count - 1)) * spacing
            let baseSum = lineBases.indices.map { i in
                lineItems[i].fraction.map { Swift.max(lineItems[i].inset, lineBases[i] + $0 * mainAvailable) } ?? lineBases[i]
            }.reduce(0, +)
            if baseSum > space {
                for (k, i) in l.enumerated() where lineItems[k].autoMin {
                    let probed = main(subviews[i].sizeThatFits(zeroProposal()))
                    if probed > lineItems[k].min { lineItems[k].min = probed }
                }
            }
            let lm = Self.widths(width: mainAvailable, items: lineItems, bases: lineBases, spacing: spacing)
            for (k, i) in l.enumerated() { m[i] = lm[k] }
        }
        let c = crossSizes(m, rowGap == nil ? crossAvailable : nil, subviews)
        return (m, c, lines, lines.map { l in l.map { c[$0] }.max() ?? 0 })
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let b = bases(subviews)
        let ideal = subviews.indices.map { i -> CGFloat in
            let it = items[i]
            let content = main(subviews[i].sizeThatFits(.unspecified))
            if it.fraction != nil { return content }
            let base = Swift.max(it.min, it.inset, Swift.min(it.max ?? .infinity, b[i]))
            return it.grow > 0 || it.basis == nil ? Swift.max(base, Swift.min(it.max ?? .infinity, content)) : base
        }
        let mainProp = main(CGSize(width: proposal.width ?? .infinity, height: proposal.height ?? .infinity))
        let mainOffered = mainProp.isFinite ? Swift.max(0, mainProp) : nil
        let mainAvailable = mainOffered ?? (ideal.reduce(0, +) + CGFloat(Swift.max(0, b.count - 1)) * spacing)
        let crossProp = cross(CGSize(width: proposal.width ?? .infinity, height: proposal.height ?? .infinity))
        let p = plan(mainAvailable, crossProp.isFinite ? crossProp : nil, subviews)
        guard let rowGap else {
            let crossSize = crossProp.isFinite && axis == .vertical ? crossProp : (p.cross.max() ?? 0)
            return makeSize(main: mainAvailable, cross: crossSize)
        }
        let totalLinesCross = p.lineCrossSizes.reduce(0, +) + CGFloat(Swift.max(0, p.lines.count - 1)) * rowGap
        let finalCross = crossProp.isFinite ? Swift.max(crossProp, totalLinesCross) : totalLinesCross
        return makeSize(main: mainAvailable, cross: finalCross)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let mainAvailable = main(bounds.size)
        let crossAvailable = cross(bounds.size)
        let p = plan(mainAvailable, proposal.height, subviews)
        let (lineOffsets, lineCrossSizes) = rowGap == nil
            ? ([CGFloat(0)], [crossAvailable])
            : Self.alignContentDistribution(
                alignContent: alignContent,
                lineCrossSizes: p.lineCrossSizes,
                availableCross: crossAvailable,
                gap: rowGap ?? 0
            )

        for (n, l) in p.lines.enumerated() {
            let lineCross = lineCrossSizes[n]
            let crossBase = lineOffsets[n]
            var m = CGFloat(0)
            for i in l {
                let a = items[i].align ?? align
                let dc: CGFloat = switch a {
                case .start, .stretch: 0
                case .center: (lineCross - p.cross[i]) / 2
                case .end: lineCross - p.cross[i]
                }
                let origin = bounds.origin
                let pt = makePoint(main: m, cross: crossBase + dc)
                let finalOrigin = CGPoint(x: origin.x + pt.x, y: origin.y + pt.y)
                let itemCross = a == .stretch ? lineCross : p.cross[i]
                subviews[i].place(
                    at: finalOrigin,
                    anchor: .topLeading,
                    proposal: mainProposal(main: p.main[i], cross: itemCross)
                )
                m += p.main[i] + spacing
            }
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
