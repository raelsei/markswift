/** Pure allocation is also executed by the native/browser comparison tests. */
export const ALLOCATION_CORE = `
nonisolated struct MarkswiftAllocationTrack {
    var basis: CGFloat
    var grow: CGFloat
    var shrink: CGFloat
    var min: CGFloat
    var max: CGFloat? = nil
    var inset: CGFloat = 0
    var basisFraction: CGFloat? = nil
}

nonisolated enum MarkswiftAllocation {
    private static func clamp(_ value: CGFloat, _ track: MarkswiftAllocationTrack) -> CGFloat {
        Swift.max(track.min, Swift.min(track.max ?? .infinity, value))
    }

    static func flex(_ available: CGFloat, _ inputTracks: [MarkswiftAllocationTrack], basisWidth: CGFloat? = nil) -> [CGFloat] {
        let tracks = inputTracks.map { track in
            var resolved = track
            if let fraction = track.basisFraction {
                resolved.basis = Swift.max(track.inset, track.basis + fraction * (basisWidth ?? available))
            }
            return resolved
        }
        let growing = tracks.reduce(CGFloat(0)) { $0 + clamp($1.basis, $1) } < available
        var target = tracks.map { $0.basis }
        var frozen = tracks.map { track in
            (growing ? track.grow : track.shrink) == 0 ||
            (growing ? track.basis > clamp(track.basis, track) : track.basis < clamp(track.basis, track))
        }
        for i in tracks.indices where frozen[i] { target[i] = clamp(tracks[i].basis, tracks[i]) }
        let initialFree = available - tracks.indices.reduce(CGFloat(0)) { $0 + (frozen[$1] ? target[$1] : tracks[$1].basis) }
        for _ in 0...tracks.count {
            if !frozen.contains(false) { break }
            var free = available - tracks.indices.reduce(CGFloat(0)) { $0 + (frozen[$1] ? target[$1] : tracks[$1].basis) }
            let factors = tracks.indices.reduce(CGFloat(0)) { sum, i in
                sum + (frozen[i] ? 0 : growing ? tracks[i].grow : tracks[i].shrink)
            }
            if factors < 1 && abs(initialFree * factors) < abs(free) { free = initialFree * factors }
            let weights = tracks.map { growing ? $0.grow : $0.shrink * Swift.max(0, $0.basis - $0.inset) }
            let weight = tracks.indices.reduce(CGFloat(0)) { $0 + (frozen[$1] ? 0 : weights[$1]) }
            var violations = Array(repeating: CGFloat(0), count: tracks.count)
            for i in tracks.indices where !frozen[i] {
                let allocated = tracks[i].basis + (weight > 0 ? free * weights[i] / weight : 0)
                target[i] = clamp(allocated, tracks[i])
                violations[i] = target[i] - allocated
            }
            let violation = violations.reduce(CGFloat(0), +)
            for i in tracks.indices {
                if abs(violation) < 0.000001 || (violation > 0 ? violations[i] > 0 : violations[i] < 0) { frozen[i] = true }
            }
        }
        return target
    }

    static func grid(_ available: CGFloat, _ tracks: [MarkswiftAllocationTrack]) -> [CGFloat] {
        var sizes = tracks.map { $0.min }
        var frozen = tracks.map { $0.grow == 0 }
        for _ in 0...tracks.count {
            let free = available - tracks.indices.reduce(CGFloat(0)) { $0 + (frozen[$1] ? sizes[$1] : 0) }
            let factors = tracks.indices.reduce(CGFloat(0)) { $0 + (frozen[$1] ? 0 : tracks[$1].grow) }
            let unit = Swift.max(0, free) / Swift.max(1, factors)
            var changed = false
            for i in tracks.indices where !frozen[i] {
                if unit * tracks[i].grow < tracks[i].min {
                    frozen[i] = true
                    sizes[i] = tracks[i].min
                    changed = true
                } else { sizes[i] = unit * tracks[i].grow }
            }
            if !changed { break }
        }
        return sizes
    }
}
`;

export const ALLOCATION_RUNTIME = ALLOCATION_CORE + `
nonisolated struct MarkswiftGridPlacement {
    var row: Int
    var column: Int
    var columnSpan: Int
}

/// Explicit flex bases/factors or fixed/fr grid tracks; row heights are measured at each proposal.
struct MarkswiftAllocatedLayout: Layout {
    var tracks: [MarkswiftAllocationTrack]
    var columnGap: CGFloat
    var rowGap: CGFloat = 0
    var grid: Bool = false
    var vertical: VerticalAlignment = .top
    var stretch: Bool = false
    var placements: [MarkswiftGridPlacement]? = nil
    var rowSizes: [CGFloat?]? = nil
    var intrinsicHeight: Bool = false
    var minimumHeight: CGFloat = 0
    var maximumHeight: CGFloat? = nil
    var capturedWidth: CGFloat

    private struct Item {
        var index: Int
        var x: CGFloat
        var width: CGFloat
        var height: CGFloat
    }
    private struct Row {
        var items: [Item] = []
        var height: CGFloat = 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = finite(proposal.width) ?? capturedWidth
        let measured = rows(width: width, subviews: subviews)
        let naturalHeight = measured.reduce(CGFloat(0)) { $0 + $1.height } + CGFloat(Swift.max(0, measured.count - 1)) * rowGap
        // Auto-height flex rows use their children's natural cross size, even when a VStack
        // offers spare height. Resolve their CSS limits here so stretch sees the used height.
        let intrinsic = Swift.max(minimumHeight, Swift.min(maximumHeight ?? .infinity, naturalHeight))
        return CGSize(width: width, height: grid ? naturalHeight : intrinsicHeight ? intrinsic : finite(proposal.height) ?? naturalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = rows(width: bounds.width, subviews: subviews)
        var y = bounds.minY
        for row in measured {
            let rowHeight = grid ? row.height : bounds.height
            for item in row.items {
                let height = stretch ? rowHeight : item.height
                let slack = rowHeight - height
                let dy = vertical == .center ? slack / 2 : vertical == .bottom ? slack : 0
                subviews[item.index].place(at: CGPoint(x: bounds.minX + item.x, y: y + dy), anchor: .topLeading,
                                          proposal: ProposedViewSize(width: item.width, height: height))
            }
            y += rowHeight + rowGap
        }
    }

    private func finite(_ value: CGFloat?) -> CGFloat? {
        guard let value, value.isFinite else { return nil }
        return Swift.max(0, value)
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        guard !tracks.isEmpty else { return [] }
        let available = width - CGFloat(Swift.max(0, tracks.count - 1)) * columnGap
        let widths = grid ? MarkswiftAllocation.grid(available, tracks) : MarkswiftAllocation.flex(available, tracks, basisWidth: width)
        if grid, let placements {
            let declaredRows = rowSizes ?? []
            let count = Swift.max(declaredRows.count, placements.map { $0.row + 1 }.max() ?? 0)
            var result = (0..<count).map { row in Row(height: row < declaredRows.count ? declaredRows[row] ?? 0 : 0) }
            var starts: [CGFloat] = []
            var x: CGFloat = 0
            for width in widths { starts.append(x); x += width + columnGap }
            for (index, subview) in subviews.enumerated() {
                guard index < placements.count else { continue }
                let p = placements[index]
                guard p.row >= 0, p.row < result.count, p.column >= 0, p.columnSpan > 0,
                      p.column + p.columnSpan <= widths.count else { continue }
                let childWidth = widths[p.column..<(p.column + p.columnSpan)].reduce(0, +) + CGFloat(p.columnSpan - 1) * columnGap
                let fixedHeight = p.row < declaredRows.count ? declaredRows[p.row] : nil
                let size = subview.sizeThatFits(ProposedViewSize(width: childWidth, height: fixedHeight))
                let height = finite(size.height) ?? 0
                result[p.row].items.append(Item(index: index, x: starts[p.column], width: childWidth, height: height))
                if fixedHeight == nil { result[p.row].height = Swift.max(result[p.row].height, height) }
            }
            return result
        }
        var result: [Row] = []
        var row = Row()
        for (index, subview) in subviews.enumerated() {
            if grid && row.items.count == tracks.count { result.append(row); row = Row() }
            let trackIndex = grid ? index % tracks.count : index
            guard trackIndex < widths.count else { continue }
            let childWidth = widths[trackIndex]
            let size = subview.sizeThatFits(ProposedViewSize(width: childWidth, height: nil))
            let height = finite(size.height) ?? 0
            let x = row.items.reduce(CGFloat(0)) { $0 + $1.width + columnGap }
            row.items.append(Item(index: index, x: x, width: childWidth, height: height))
            row.height = Swift.max(row.height, height)
        }
        if !row.items.isEmpty { result.append(row) }
        return result
    }
}
`;
