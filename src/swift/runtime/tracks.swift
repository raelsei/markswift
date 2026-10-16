/// `fr(f, min:)`: `minmax(<min>px, <f>fr)`; a bare fr track has no floor.
enum MarkswiftTrack: Sendable { case px(CGFloat), fr(CGFloat, min: CGFloat = 0), auto }
enum MarkswiftAutoRepeat: Sendable { case fill(min: CGFloat), fit(min: CGFloat) }
/// A grid row: `auto` (also `min-content`/`max-content`) is as tall as its items, `px` is fixed.
nonisolated enum MarkswiftRow: Sendable, Equatable { case auto, px(CGFloat) }
/// `justify-self` inside the cell's column span; `stretch` takes the span's width.
nonisolated enum MarkswiftJustify: Sendable { case stretch, start, center, end }

/// A cell's CSS grid area in 1-based lines (spans count tracks), resolved from the capture (areas included).
nonisolated struct MarkswiftGridCell: Sendable, Equatable {
    var column: Int
    var row: Int
    var columnSpan: Int = 1
    var rowSpan: Int = 1
    var justify: MarkswiftJustify = .stretch
}

/// Read by `MarkswiftTracks`; a subview without it takes the next row-major cell.
nonisolated struct MarkswiftGridCellKey: LayoutValueKey { static let defaultValue: MarkswiftGridCell? = nil }

extension View {
    /// Places this view in a `MarkswiftTracks` grid area (CSS `grid-column`/`grid-row`/`justify-self`).
    func markswiftGridCell(column: Int, row: Int, columnSpan: Int = 1, rowSpan: Int = 1,
                           justify: MarkswiftJustify = .stretch) -> some View {
        layoutValue(key: MarkswiftGridCellKey.self,
                    value: MarkswiftGridCell(column: column, row: row, columnSpan: columnSpan, rowSpan: rowSpan, justify: justify))
    }
}

/// CSS grid column tracks (px / fr / auto, or repeat(auto-fill|auto-fit, minmax(min, 1fr))), auto/px rows, and
/// cells placed row-major or by `markswiftGridCell`.
struct MarkswiftTracks: Layout {
    var tracks: [MarkswiftTrack] = []
    var autoRepeat: MarkswiftAutoRepeat? = nil
    /// Explicit rows (`grid-template-rows`); rows past them are `autoRow` (`grid-auto-rows`).
    var rows: [MarkswiftRow] = []
    var autoRow: MarkswiftRow = .auto
    var hSpacing: CGFloat
    var vSpacing: CGFloat
    /// align-items stretch: every cell is proposed its row span's height.
    var stretch: Bool = true

    /// Pure column solver; `MarkswiftTracks.columns` and `solveTracks` (src/analysis/grid-tracks.ts) must agree.
    static func columns(width: CGFloat, tracks: [MarkswiftTrack], autoRepeat: MarkswiftAutoRepeat?, count: Int,
                        spacing: CGFloat, autoWidths: [CGFloat]) -> [CGFloat] {
        if let autoRepeat {
            let (min, fit): (CGFloat, Bool) = switch autoRepeat {
            case .fill(let min): (min, false)
            case .fit(let min): (min, true)
            }
            var n = max(1, Int(((width + spacing) / (min + spacing)).rounded(.down)))
            if fit { n = Swift.min(n, max(1, count)) } // auto-fit collapses empty tracks
            return Array(repeating: max(0, (width - CGFloat(n - 1) * spacing) / CGFloat(n)), count: n)
        }
        var sizes = [CGFloat](repeating: 0, count: tracks.count)
        var open = [Bool](repeating: false, count: tracks.count)
        for (c, t) in tracks.enumerated() {
            switch t {
            case .px(let v): sizes[c] = v
            case .fr(_, let floor): sizes[c] = floor; open[c] = true
            case .auto: sizes[c] = c < autoWidths.count ? autoWidths[c] : 0
            }
        }
        // CSS "find the size of an fr": a floor above its share freezes the track; the rest share again.
        var changed = true
        while changed {
            changed = false
            let free = width - CGFloat(tracks.count - 1) * spacing - tracks.indices.map { open[$0] ? 0 : sizes[$0] }.reduce(0, +)
            var frs: CGFloat = 0
            for (c, t) in tracks.enumerated() where open[c] { if case .fr(let f, _) = t { frs += f } }
            let unit = max(0, free) / max(1, frs)
            for (c, t) in tracks.enumerated() where open[c] {
                guard case .fr(let f, let floor) = t else { continue }
                if unit * f < floor {
                    open[c] = false
                    sizes[c] = floor
                    changed = true
                } else { sizes[c] = unit * f }
            }
        }
        return sizes
    }

    /// Pure row solver; `MarkswiftTracks.rowHeights` and `solveRows` (src/analysis/grid-tracks.ts) must agree.
    /// `items`: each cell's 1-based start row, row span and margin-box height. CSS grid §12.5 for heights: a spanning
    /// cell's missing height goes equally to its spanned auto rows no cell has sized yet, else to all of its spanned
    /// auto rows; cells of the same span take the largest share per row, smaller spans first.
    static func rowHeights(rows: [MarkswiftRow], autoRow: MarkswiftRow, spacing: CGFloat,
                           items: [(row: Int, span: Int, height: CGFloat)]) -> [CGFloat] {
        let count = max(rows.count, items.map { $0.row + $0.span - 1 }.max() ?? 0)
        let defs = (0..<count).map { $0 < rows.count ? rows[$0] : autoRow }
        var sizes = defs.map { def -> CGFloat in if case .px(let v) = def { v } else { 0 } }
        var open = defs.map { $0 == .auto }
        for item in items where item.span == 1 && defs[item.row - 1] == .auto {
            sizes[item.row - 1] = max(sizes[item.row - 1], item.height)
            open[item.row - 1] = false
        }
        for span in Set(items.map(\.span).filter { $0 > 1 }).sorted() {
            var planned = [CGFloat](repeating: 0, count: count)
            for item in items where item.span == span {
                let range = (item.row - 1)..<(item.row - 1 + span)
                let extra = item.height - range.map { sizes[$0] }.reduce(0, +) - CGFloat(span - 1) * spacing
                let auto = range.filter { defs[$0] == .auto }
                let targets = auto.contains { open[$0] } ? auto.filter { open[$0] } : auto
                if extra > 0 { for r in targets { planned[r] = max(planned[r], extra / CGFloat(targets.count)) } }
            }
            for r in planned.indices where planned[r] > 0 {
                sizes[r] += planned[r]
                open[r] = false
            }
        }
        return sizes
    }

    /// Each subview's cell: its `markswiftGridCell`, else the next row-major cell of `count` columns.
    private func cells(_ subviews: Subviews, _ count: Int) -> [MarkswiftGridCell] {
        subviews.indices.map { subviews[$0][MarkswiftGridCellKey.self] ?? MarkswiftGridCell(column: $0 % count + 1, row: $0 / count + 1) }
    }

    /// Size of `count` tracks from 0-based `start`, gaps between them included.
    private static func extent(_ sizes: [CGFloat], _ start: Int, _ count: Int, _ gap: CGFloat) -> CGFloat {
        let lo = min(start, sizes.count), hi = min(start + count, sizes.count)
        return sizes[lo..<hi].reduce(0, +) + CGFloat(max(0, hi - lo - 1)) * gap
    }

    /// The widest ideal width among single-column cells in column `c` (`ideal` per subview).
    private func widest(_ c: Int, _ at: [MarkswiftGridCell], _ ideal: [CGFloat]) -> CGFloat {
        at.indices.filter { at[$0].column == c + 1 && at[$0].columnSpan == 1 }.map { ideal[$0] }.max() ?? 0
    }

    private func columns(_ width: CGFloat, _ subviews: Subviews) -> [CGFloat] {
        let at = cells(subviews, max(1, tracks.count))
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }
        let autoWidths = tracks.indices.map { c -> CGFloat in
            guard case .auto = tracks[c] else { return 0 }
            return widest(c, at, ideal)
        }
        return Self.columns(width: width, tracks: tracks, autoRepeat: autoRepeat, count: subviews.count,
                            spacing: hSpacing, autoWidths: autoWidths)
    }

    /// Without a finite width every column takes its content's ideal width (fr and auto-repeat columns included).
    private func idealColumns(_ subviews: Subviews) -> [CGFloat] {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }
        if autoRepeat != nil { return Array(repeating: ideal.max() ?? 0, count: max(1, subviews.count)) }
        let at = cells(subviews, max(1, tracks.count))
        return tracks.indices.map { c in
            if case .px(let v) = tracks[c] { return v }
            return widest(c, at, ideal)
        }
    }

    /// Cells, each cell's width inside its column span (`justify`), and the row heights.
    private func arrange(_ cols: [CGFloat], _ subviews: Subviews) -> (cells: [MarkswiftGridCell], widths: [CGFloat], rows: [CGFloat]) {
        let at = cells(subviews, cols.count)
        let widths = subviews.indices.map { i -> CGFloat in
            let span = Self.extent(cols, at[i].column - 1, at[i].columnSpan, hSpacing)
            if at[i].justify == .stretch { return span }
            return min(span, subviews[i].sizeThatFits(ProposedViewSize(width: span, height: nil)).width)
        }
        let items = subviews.indices.map { i in
            (row: at[i].row, span: at[i].rowSpan,
             height: subviews[i].sizeThatFits(ProposedViewSize(width: widths[i], height: nil)).height)
        }
        return (at, widths, Self.rowHeights(rows: rows, autoRow: autoRow, spacing: vSpacing, items: items))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let finite = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
        let cols = finite.map { columns($0, subviews) } ?? idealColumns(subviews)
        let r = arrange(cols, subviews).rows
        let width = finite ?? Self.extent(cols, 0, cols.count, hSpacing)
        return CGSize(width: width, height: Self.extent(r, 0, r.count, vSpacing))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let cols = columns(bounds.width, subviews)
        let (at, widths, r) = arrange(cols, subviews)
        for i in subviews.indices {
            let cell = at[i]
            let span = Self.extent(cols, cell.column - 1, cell.columnSpan, hSpacing)
            let dx = cell.justify == .end ? span - widths[i] : cell.justify == .center ? (span - widths[i]) / 2 : 0
            let x = bounds.minX + Self.extent(cols, 0, cell.column - 1, hSpacing) + (cell.column > 1 ? hSpacing : 0) + dx
            let y = bounds.minY + Self.extent(r, 0, cell.row - 1, vSpacing) + (cell.row > 1 ? vSpacing : 0)
            let h = Self.extent(r, cell.row - 1, cell.rowSpan, vSpacing)
            subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                              proposal: ProposedViewSize(width: widths[i], height: stretch ? h : nil))
        }
    }
}

/// CSS percentage width: the child takes `fraction` of the proposed width, leading-aligned; the wrapper keeps the full width.
struct MarkswiftFraction: Layout {
    var fraction: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let width = proposal.width, width.isFinite else { return subviews.first?.sizeThatFits(.unspecified) ?? .zero }
        let h = subviews.first?.sizeThatFits(ProposedViewSize(width: width * fraction, height: proposal.height)).height ?? 0
        return CGSize(width: width, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width * fraction, height: bounds.height))
    }
}

extension View {
    /// CSS percentage width: the box takes `fraction` of its container's width, leading-aligned.
    func markswiftFraction(_ fraction: CGFloat) -> some View { MarkswiftFraction(fraction: fraction) { self } }
}
