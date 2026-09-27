/** CSS line collection precedes flexible length resolution; bases are live native ideals. */
export const INTRINSIC_FLEX_CORE = `
nonisolated struct MarkswiftIntrinsicFlexRow {
    var indices: [Int]
    var widths: [CGFloat]
}

nonisolated enum MarkswiftIntrinsicFlexGeometry {
    static func rows(width: CGFloat, tracks: [MarkswiftAllocationTrack], gap: CGFloat, wrapping: Bool) -> [MarkswiftIntrinsicFlexRow] {
        var lines: [[Int]] = []
        var line: [Int] = []
        var used: CGFloat = 0
        for index in tracks.indices {
            let hypothetical = Swift.max(tracks[index].min, tracks[index].basis)
            let next = used + (line.isEmpty ? 0 : gap) + hypothetical
            if wrapping && !line.isEmpty && next > width {
                lines.append(line)
                line = []
                used = 0
            }
            used += (line.isEmpty ? 0 : gap) + hypothetical
            line.append(index)
        }
        if !line.isEmpty { lines.append(line) }
        return lines.map { indices in
            let available = width - CGFloat(Swift.max(0, indices.count - 1)) * gap
            return MarkswiftIntrinsicFlexRow(indices: indices,
                widths: MarkswiftAllocation.flex(available, indices.map { tracks[$0] }))
        }
    }
}
`;

export const INTRINSIC_FLEX_RUNTIME = INTRINSIC_FLEX_CORE + `
nonisolated struct MarkswiftIntrinsicFlexMinimum: LayoutValueKey {
    static var defaultValue: CGFloat { 0 }
}
nonisolated struct MarkswiftIntrinsicFlexShrink: LayoutValueKey {
    static var defaultValue: CGFloat { 1 }
}
nonisolated struct MarkswiftIntrinsicFlexInset: LayoutValueKey {
    static var defaultValue: CGFloat { 0 }
}

/// Plain auto-basis flex items, with native min-content floors and authored pixel gaps.
struct MarkswiftIntrinsicFlex: Layout {
    var columnGap: CGFloat
    var rowGap: CGFloat
    var wrapping: Bool
    var horizontal: HorizontalAlignment = .leading
    var vertical: VerticalAlignment = .top
    var between: Bool = false
    var stretch: Bool = false

    private struct Item {
        var index: Int
        var width: CGFloat
        var height: CGFloat
    }
    private struct Row {
        var items: [Item]
        var width: CGFloat
        var height: CGFloat
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let tracks = tracks(subviews)
        let ideal = tracks.reduce(CGFloat(0)) { $0 + Swift.max($1.min, $1.basis) }
            + CGFloat(Swift.max(0, tracks.count - 1)) * columnGap
        let width = finite(proposal.width) ?? ideal
        let measured = rows(width: width, tracks: tracks, subviews: subviews)
        let height = measured.reduce(CGFloat(0)) { $0 + $1.height }
            + CGFloat(Swift.max(0, measured.count - 1)) * rowGap
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = rows(width: Swift.max(0, bounds.width), tracks: tracks(subviews), subviews: subviews)
        var y = bounds.minY
        for row in measured {
            let slack = bounds.width - row.width
            // CSS space-between falls back to start for negative free space and singleton rows.
            let gap = columnGap + (between && row.items.count > 1 ? Swift.max(0, slack) / CGFloat(row.items.count - 1) : 0)
            var x = bounds.minX + (horizontal == .center ? slack / 2 : horizontal == .trailing ? slack : 0)
            for item in row.items {
                let height = stretch ? row.height : item.height
                let cross = row.height - height
                let dy = vertical == .center ? cross / 2 : vertical == .bottom ? cross : 0
                subviews[item.index].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                    proposal: ProposedViewSize(width: item.width, height: height))
                x += item.width + gap
            }
            y += row.height + rowGap
        }
    }

    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        guard guide == .firstTextBaseline || guide == .lastTextBaseline else { return nil }
        let measured = rows(width: Swift.max(0, bounds.width), tracks: tracks(subviews), subviews: subviews)
        let index = guide == .firstTextBaseline ? 0 : measured.count - 1
        guard measured.indices.contains(index), let item = measured[index].items.first else { return nil }
        let row = measured[index]
        let height = stretch ? row.height : item.height
        let cross = row.height - height
        let dy = vertical == .center ? cross / 2 : vertical == .bottom ? cross : 0
        let y = measured.prefix(index).reduce(CGFloat(0)) { $0 + $1.height + rowGap }
        return y + dy + subviews[item.index].dimensions(in: ProposedViewSize(width: item.width, height: height))[guide]
    }

    private func finite(_ value: CGFloat?) -> CGFloat? {
        guard let value, value.isFinite else { return nil }
        return Swift.max(0, value)
    }

    private func tracks(_ subviews: Subviews) -> [MarkswiftAllocationTrack] {
        subviews.map { subview in
            MarkswiftAllocationTrack(basis: finite(subview.sizeThatFits(.unspecified).width) ?? 0,
                grow: 0, shrink: subview[MarkswiftIntrinsicFlexShrink.self],
                min: subview[MarkswiftIntrinsicFlexMinimum.self], inset: subview[MarkswiftIntrinsicFlexInset.self])
        }
    }

    private func rows(width: CGFloat, tracks: [MarkswiftAllocationTrack], subviews: Subviews) -> [Row] {
        MarkswiftIntrinsicFlexGeometry.rows(width: width, tracks: tracks, gap: columnGap, wrapping: wrapping).map { allocated in
            let items = zip(allocated.indices, allocated.widths).map { index, width in
                Item(index: index, width: width,
                    height: finite(subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil)).height) ?? 0)
            }
            return Row(items: items, width: allocated.widths.reduce(0, +) + CGFloat(Swift.max(0, items.count - 1)) * columnGap,
                height: items.map { $0.height }.max() ?? 0)
        }
    }
}
`;
