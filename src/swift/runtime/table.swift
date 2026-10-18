/// A `table-layout: fixed` column: border-box px, a fraction of the available width plus the cell's
/// horizontal padding and border, or an equal share of what is left.
enum MarkswiftTableColumn: Sendable { case px(CGFloat), percent(CGFloat, plus: CGFloat), auto }

/// A CSS table. Every subview carries `.markswiftGridCell(column:row:columnSpan:rowSpan:)` (1-based,
/// tracks.swift); the first `bands` subviews paint row groups and rows and are never measured (under the cells; a
/// band that only draws collapsed borders carries `.zIndex(1)` and draws over them, as CSS paints borders last).
/// `border-spacing` surrounds every column and row, outer edges included.
// ponytail: no Layout cache, cells are measured on every pass; add one if large tables profile slow.
struct MarkswiftTable: Layout {
    /// Captured column border-box widths; without `fixed` they scale to the offered width (auto layout).
    var widths: [CGFloat]
    /// Captured row heights: floors; a row grows to its tallest single-row cell.
    var heights: [CGFloat]
    var hSpacing: CGFloat = 0
    var vSpacing: CGFloat = 0
    var bands: Int = 0
    var fixed: [MarkswiftTableColumn]? = nil

    /// Pure column solver; `solveTableColumns` (src/analysis/table.ts) must agree.
    static func columns(width: CGFloat?, widths: [CGFloat], spacing: CGFloat, fixed: [MarkswiftTableColumn]?) -> [CGFloat] {
        let gaps = CGFloat(widths.count + 1) * spacing
        let natural = widths.reduce(0, +)
        let avail = max(0, (width ?? natural + gaps) - gaps)
        guard let fixed else {
            return widths.map { natural > 0 ? $0 * avail / natural : avail / CGFloat(max(1, widths.count)) }
        }
        let base: [CGFloat] = fixed.map {
            switch $0 {
            case .px(let px): px
            case .percent(let fraction, let plus): fraction * avail + plus
            case .auto: 0
            }
        }
        let autos = fixed.filter { if case .auto = $0 { true } else { false } }.count
        let left = avail - base.reduce(0, +)
        if autos > 0 {
            return zip(fixed, base).map { column, b in if case .auto = column { max(0, left / CGFloat(autos)) } else { b } }
        }
        let sum = base.reduce(0, +)
        return left > 0 && sum > 0 ? base.map { $0 + left * $0 / sum } : base
    }

    private static func span(_ sizes: [CGFloat], _ first: Int, _ count: Int, _ gap: CGFloat) -> CGFloat {
        let lo = min(max(0, first), sizes.count), hi = min(sizes.count, lo + max(1, count))
        return hi > lo ? sizes[lo..<hi].reduce(0, +) + CGFloat(hi - lo - 1) * gap : 0
    }

    private func slot(_ s: LayoutSubview) -> MarkswiftGridCell {
        s[MarkswiftGridCellKey.self] ?? MarkswiftGridCell(column: 1, row: 1)
    }

    private func rows(_ cols: [CGFloat], _ subviews: Subviews) -> [CGFloat] {
        var rows = heights
        let cells = subviews.dropFirst(bands).map { (slot($0), $0) }
        func need(_ c: MarkswiftGridCell, _ s: LayoutSubview) -> CGFloat {
            s.sizeThatFits(ProposedViewSize(width: Self.span(cols, c.column - 1, c.columnSpan, hSpacing), height: nil)).height
        }
        for (c, s) in cells where c.rowSpan == 1 && c.row >= 1 && c.row <= rows.count {
            rows[c.row - 1] = max(rows[c.row - 1], need(c, s))
        }
        // ponytail: a rowspan cell taller than its rows grows only its last row; CSS spreads the excess over them.
        for (c, s) in cells where c.rowSpan > 1 && c.row >= 1 && c.row <= rows.count {
            let last = min(rows.count, c.row - 1 + c.rowSpan) - 1
            let excess = need(c, s) - Self.span(rows, c.row - 1, c.rowSpan, vSpacing)
            if excess > 0 { rows[last] += excess }
        }
        return rows
    }

    private func solve(_ width: CGFloat?, _ subviews: Subviews) -> ([CGFloat], [CGFloat]) {
        let w = width.flatMap { $0.isFinite ? $0 : nil }
        let cols = Self.columns(width: w, widths: widths, spacing: hSpacing, fixed: fixed)
        return (cols, rows(cols, subviews))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let (cols, rows) = solve(proposal.width, subviews)
        return CGSize(width: cols.reduce(0, +) + CGFloat(cols.count + 1) * hSpacing,
                      height: rows.reduce(0, +) + CGFloat(rows.count + 1) * vSpacing)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let (cols, rows) = solve(bounds.width, subviews)
        for s in subviews {
            let c = slot(s)
            let x = bounds.minX + CGFloat(c.column) * hSpacing + cols.prefix(max(0, c.column - 1)).reduce(0, +)
            let y = bounds.minY + CGFloat(c.row) * vSpacing + rows.prefix(max(0, c.row - 1)).reduce(0, +)
            s.place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                    proposal: ProposedViewSize(width: Self.span(cols, c.column - 1, c.columnSpan, hSpacing),
                                               height: Self.span(rows, c.row - 1, c.rowSpan, vSpacing)))
        }
    }
}
