/** Pure allocation is also executed by the focused host-Swift proof. */
export const TABLE_ALLOCATION_RUNTIME = `
nonisolated enum MarkswiftTableAllocation {
    struct Column {
        var kind: Int // 0 fixed, 1 fraction, 2 unassigned
        var value: CGFloat = 0
        var extra: CGFloat = 0
    }

    struct Cell {
        var row: Int
        var column: Int
        var rowSpan: Int = 1
        var columnSpan: Int = 1
    }

    static func minimum(_ tracks: [Column]) -> CGFloat {
        let fixed = tracks.reduce(CGFloat(0)) { $0 + ($1.kind == 0 ? $1.value : 0) + $1.extra }
        let fraction = tracks.reduce(CGFloat(0)) { $0 + ($1.kind == 1 ? $1.value : 0) }
        return fraction < 1 ? max(0, fixed / (1 - fraction)) : 0
    }

    static func columns(_ tracks: [Column], available: CGFloat) -> [CGFloat] {
        let width = max(minimum(tracks), max(0, available))
        var result = tracks.map { $0.kind == 2 ? CGFloat(0) : max(0, ($0.kind == 1 ? width * $0.value : $0.value) + $0.extra) }
        let automatic = tracks.filter { $0.kind == 2 }.count
        let total = result.reduce(0, +)
        if automatic > 0 {
            let share = max(0, width - total) / CGFloat(automatic)
            for i in tracks.indices where tracks[i].kind == 2 { result[i] = share }
        } else {
            let fixed = tracks.indices.reduce(CGFloat(0)) { $0 + (tracks[$1].kind == 0 ? result[$1] : 0) }
            let fractions = total - fixed
            if fixed > 0 && fractions > 0 {
                for i in tracks.indices where tracks[i].kind == 0 { result[i] *= max(0, width - fractions) / fixed }
            } else if total > 0 {
                result = result.map { $0 * width / total }
            }
        }
        return result
    }

    static func rows(minimums: [CGFloat], cells: [Cell], heights: [CGFloat], gap: CGFloat) -> [CGFloat] {
        var result = minimums
        // Ordinary cells set each row's minimum before spanning cells distribute a deficit.
        for (index, cell) in cells.enumerated() where cell.rowSpan == 1 {
            result[cell.row] = max(result[cell.row], heights[index])
        }
        for (index, cell) in cells.enumerated() where cell.rowSpan > 1 {
            let range = cell.row..<(cell.row + cell.rowSpan)
            let allocated = range.reduce(CGFloat(0)) { $0 + result[$1] } + CGFloat(cell.rowSpan - 1) * gap
            let extra = max(0, heights[index] - allocated) / CGFloat(cell.rowSpan)
            for row in range { result[row] += extra }
        }
        return result
    }

    static func rect(_ cell: Cell, widths: [CGFloat], heights: [CGFloat], columnGap: CGFloat, rowGap: CGFloat) -> CGRect {
        let x = widths.prefix(cell.column).reduce(0, +) + CGFloat(cell.column) * columnGap
        let y = heights.prefix(cell.row).reduce(0, +) + CGFloat(cell.row) * rowGap
        let w = widths[cell.column..<(cell.column + cell.columnSpan)].reduce(0, +) + CGFloat(cell.columnSpan - 1) * columnGap
        let h = heights[cell.row..<(cell.row + cell.rowSpan)].reduce(0, +) + CGFloat(cell.rowSpan - 1) * rowGap
        return CGRect(x: x, y: y, width: w, height: h)
    }
}
`;

export const TABLE_RUNTIME = `${TABLE_ALLOCATION_RUNTIME}${TABLE_INTRINSIC_FONT_RUNTIME}${TABLE_INTRINSIC_RUNTIME}
/// Declared or intrinsic columns, section paint and cells share one native proposal.
struct MarkswiftTableLayout: Layout {
    struct Placement {
        var kind: Int // 0 cell, 1 row/section paint, 2 body paint, 3 caption
        var cell: MarkswiftTableAllocation.Cell
    }
    var columns: [MarkswiftTableAllocation.Column]
    var placements: [Placement]
    var rowMinimums: [CGFloat]
    var columnGap: CGFloat
    var rowGap: CGFloat
    var insets: EdgeInsets
    var capturedWidth: CGFloat
    var captionBottom: Bool = false
    var captionMargins: [CGFloat] = [0, 0]
    var fixedRows: Bool = false
    var intrinsic: [MarkswiftTableIntrinsic.Cell] = []

    private struct Geometry {
        var width: CGFloat
        var bodyHeight: CGFloat
        var captionHeight: CGFloat
        var bodyY: CGFloat
        var captionY: CGFloat
        var widths: [CGFloat]
        var heights: [CGFloat]
        var height: CGFloat { bodyHeight + captionHeight + captionMarginsTotal }
        var captionMarginsTotal: CGFloat
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil } ?? capturedWidth
        let geometry = geometry(width: width, subviews: subviews)
        return CGSize(width: geometry.width, height: geometry.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let geometry = geometry(width: bounds.width, subviews: subviews)
        for (index, placement) in placements.enumerated() {
            var frame: CGRect
            if placement.kind == 2 {
                frame = CGRect(x: 0, y: geometry.bodyY, width: geometry.width, height: geometry.bodyHeight)
            } else if placement.kind == 3 {
                frame = CGRect(x: 0, y: geometry.captionY, width: geometry.width, height: geometry.captionHeight)
            } else {
                frame = MarkswiftTableAllocation.rect(placement.cell, widths: geometry.widths, heights: geometry.heights, columnGap: columnGap, rowGap: rowGap)
                frame.origin.x += insets.leading
                frame.origin.y += geometry.bodyY + insets.top
            }
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), anchor: .topLeading,
                                  proposal: ProposedViewSize(width: frame.width, height: frame.height))
        }
    }

    private func geometry(width: CGFloat, subviews: Subviews) -> Geometry {
        let overhead = insets.leading + insets.trailing + CGFloat(max(0, columns.count - 1)) * columnGap
        let maximums = intrinsic.isEmpty ? [] : MarkswiftTableIntrinsic.maximums(intrinsic, count: columns.count)
        let minimum = maximums.isEmpty ? MarkswiftTableAllocation.minimum(columns) : maximums.reduce(0, +)
        let width = max(width, minimum + overhead)
        let available = max(0, width - overhead)
        let widths = maximums.isEmpty ? MarkswiftTableAllocation.columns(columns, available: available)
            : MarkswiftTableIntrinsic.columns(maximums, available: available)
        var captionHeight: CGFloat = 0
        var cells: [MarkswiftTableAllocation.Cell] = []
        var measured: [CGFloat] = []
        for (index, placement) in placements.enumerated() {
            if placement.kind == 3 {
                captionHeight = max(0, subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil)).height)
            } else if placement.kind == 0 && !fixedRows {
                let cell = placement.cell
                let cellWidth = widths[cell.column..<(cell.column + cell.columnSpan)].reduce(0, +) + CGFloat(cell.columnSpan - 1) * columnGap
                let height = subviews[index].sizeThatFits(ProposedViewSize(width: cellWidth, height: nil)).height
                cells.append(cell)
                measured.append(height.isFinite ? max(0, height) : 0)
            }
        }
        let heights = fixedRows ? rowMinimums : MarkswiftTableAllocation.rows(minimums: rowMinimums, cells: cells, heights: measured, gap: rowGap)
        let bodyHeight = insets.top + insets.bottom + heights.reduce(0, +) + CGFloat(max(0, heights.count - 1)) * rowGap
        let margins = placements.contains { $0.kind == 3 } ? captionMargins : [0, 0]
        let extent = captionHeight + margins[0] + margins[1]
        return Geometry(width: width, bodyHeight: bodyHeight, captionHeight: captionHeight,
                        bodyY: captionBottom ? 0 : extent, captionY: (captionBottom ? bodyHeight : 0) + margins[0],
                        widths: widths, heights: heights, captionMarginsTotal: margins[0] + margins[1])
    }
}
`;
import { TABLE_INTRINSIC_FONT_RUNTIME, TABLE_INTRINSIC_RUNTIME } from "./table-intrinsic-runtime.ts";
