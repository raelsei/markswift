/** Fixed-item reflow and equal-column proposals; not a general CSS flex allocation algorithm. */
export const FLOW_RUNTIME = `
struct MarkswiftFlow: Layout {
    var columnGap: CGFloat
    var rowGap: CGFloat
    var horizontal: HorizontalAlignment = .leading
    var vertical: VerticalAlignment = .top
    var columns: Int? = nil
    var stretch: Bool = false

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
        let available = finiteWidth(proposal.width) ?? idealTrackWidth(subviews)
        let rows = rows(width: available ?? .infinity, subviews: subviews)
        let width = available ?? rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(CGFloat(0)) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * rowGap
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
            y += row.height + rowGap
        }
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
            let size = CGSize(width: columnWidth ?? (measured.width.isFinite ? max(0, measured.width) : 0),
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
