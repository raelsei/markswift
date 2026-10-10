struct MarkswiftFlow: Layout {
    var columnGap: CGFloat
    var rowGap: CGFloat
    var horizontal: HorizontalAlignment = .leading
    var vertical: VerticalAlignment = .top

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
        let available = finiteWidth(proposal.width)
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
                let slack = row.height - item.size.height
                let dy = vertical == .center ? slack / 2 : vertical == .bottom ? slack : 0
                subviews[item.index].place(at: CGPoint(x: x, y: y + dy), anchor: .topLeading,
                                          proposal: ProposedViewSize(width: item.size.width, height: item.size.height))
                x += item.size.width + columnGap
            }
            y += row.height + rowGap
        }
    }

    private func finiteWidth(_ value: CGFloat?) -> CGFloat? {
        guard let value, value.isFinite else { return nil }
        return max(0, value)
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var result: [Row] = []
        var row = Row()
        for (index, subview) in subviews.enumerated() {
            var measured = subview.sizeThatFits(.unspecified)
            // CSS shrinks an item wider than the line down to the line (flex-shrink: 1); text re-wraps instead of overflowing.
            if measured.width > width { measured = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
            let size = CGSize(width: measured.width.isFinite ? max(0, measured.width) : 0,
                              height: measured.height.isFinite ? max(0, measured.height) : 0)
            let gap = row.items.isEmpty ? 0 : columnGap
            if !row.items.isEmpty && row.width + gap + size.width > width + 0.0001 {
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
