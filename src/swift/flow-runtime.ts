/** Fixed-item reflow and equal-column proposals; not a general CSS flex allocation algorithm. */
export const FLOW_RUNTIME = `
nonisolated struct MarkswiftFlowItemAdvance: LayoutValueKey {
    static var defaultValue: CGFloat? { nil }
}

struct MarkswiftFlow: Layout {
    var columnGap: CGFloat
    var rowGap: CGFloat
    var horizontal: HorizontalAlignment = .leading
    var vertical: VerticalAlignment = .top
    var columns: Int? = nil
    var stretch: Bool = false
    var baselineStep: CGFloat? = nil
    var fitContent: Bool = false
    var minWidth: CGFloat = 0
    var maxWidth: CGFloat? = nil

    private struct Item {
        var index: Int
        var size: CGSize
    }

    private struct Row {
        var items: [Item] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let available: CGFloat?
        if fitContent {
            let intrinsic = rows(width: .infinity, subviews: subviews)
            let maximum = intrinsic.map { $0.width }.max() ?? 0
            let minimum = intrinsic.flatMap { $0.items }.map { $0.size.width }.max() ?? 0
            // CSS shrink-to-fit retains whole words. Authored max-width constrains the box,
            // even below min-content; oversized words still retain their original advances.
            let fit = min(maximum, max(minimum, finiteWidth(proposal.width) ?? maximum))
            available = max(minWidth, min(maxWidth ?? .infinity, fit))
        } else {
            available = finiteWidth(proposal.width) ?? idealTrackWidth(subviews)
        }
        let rows = rows(width: available ?? .infinity, subviews: subviews)
        let width = available ?? rows.map { $0.width }.max() ?? 0
        let height = baselineStep.map { $0 * CGFloat(max(0, rows.count - 1)) + (rows.last?.height ?? 0) }
            ?? (rows.reduce(CGFloat(0)) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * rowGap)
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = rows(width: max(0, bounds.width), subviews: subviews)
        var y = bounds.minY
        for row in rows {
            let remaining = bounds.width - row.width
            var x = bounds.minX + (horizontal == .center ? remaining / 2 : horizontal == .trailing ? remaining : 0)
            for item in row.items {
                let height = stretch ? row.height : item.size.height
                let slack = row.height - height
                let dy = vertical == .center ? slack / 2 : vertical == .bottom ? slack : 0
                subviews[item.index].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                                          proposal: ProposedViewSize(width: item.size.width, height: height))
                x += item.size.width + columnGap
            }
            y += baselineStep ?? (row.height + rowGap)
        }
    }

    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        guard guide == .firstTextBaseline || guide == .lastTextBaseline else { return nil }
        let measured = rows(width: max(0, bounds.width), subviews: subviews)
        let rowIndex = guide == .firstTextBaseline ? 0 : measured.count - 1
        guard measured.indices.contains(rowIndex), let item = measured[rowIndex].items.first else { return nil }
        let row = measured[rowIndex]
        let height = stretch ? row.height : item.size.height
        let slack = row.height - height
        let dy = vertical == .center ? slack / 2 : vertical == .bottom ? slack : 0
        let y = measured.prefix(rowIndex).reduce(CGFloat(0)) { $0 + (baselineStep ?? ($1.height + rowGap)) }
        let dimensions = subviews[item.index].dimensions(in: ProposedViewSize(width: item.size.width, height: height))
        return y + dy + dimensions[guide]
    }

    private func finiteWidth(_ value: CGFloat?) -> CGFloat? {
        guard let value, value.isFinite else { return nil }
        return max(0, value)
    }

    private func idealTrackWidth(_ subviews: Subviews) -> CGFloat? {
        guard let columns, columns > 0 else { return nil }
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.filter { $0.isFinite }.max() ?? 0
        return max(0, ideal) * CGFloat(columns) + CGFloat(columns - 1) * columnGap
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var result: [Row] = []
        var row = Row()
        let columnWidth = columns.flatMap { count in
            count > 0 && width.isFinite ? max(0, (width - CGFloat(count - 1) * columnGap) / CGFloat(count)) : nil
        }
        for (index, subview) in subviews.enumerated() {
            let measured = subview.sizeThatFits(ProposedViewSize(width: columnWidth, height: nil))
            let advance = subview[MarkswiftFlowItemAdvance.self].flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
            let size = CGSize(width: columnWidth ?? advance ?? (measured.width.isFinite ? max(0, measured.width) : 0),
                              height: measured.height.isFinite ? max(0, measured.height) : 0)
            let gap = row.items.isEmpty ? 0 : columnGap
            let full = columns.map { row.items.count >= $0 } ?? (row.width + gap + size.width > width + 0.0001)
            if !row.items.isEmpty && full {
                result.append(row)
                row = Row()
            }
            row.width += (row.items.isEmpty ? 0 : columnGap) + size.width
            row.height = max(row.height, size.height)
            row.items.append(Item(index: index, size: size))
        }
        if !row.items.isEmpty { result.append(row) }
        return result
    }
}
`;
