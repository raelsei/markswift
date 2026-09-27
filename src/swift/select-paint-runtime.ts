/** Pure paint for the visible browser list rows; the caller clips to the select content box. */
export const SELECT_PAINT_RUNTIME = `
struct MarkswiftCapturedSelectRow {
    let label: String
    let frame: CGRect
    let padding: SwiftUI.EdgeInsets
    let font: SwiftUI.Font
    let color: SwiftUI.Color
    let background: SwiftUI.Color
}

struct MarkswiftCapturedSelectRows: SwiftUI.View {
    let rows: [MarkswiftCapturedSelectRow]
    let inset: SwiftUI.EdgeInsets

    var body: some SwiftUI.View {
        SwiftUI.GeometryReader { _ in
            SwiftUI.ZStack(alignment: .topLeading) {
                SwiftUI.Color.clear
                SwiftUI.ForEach(rows.indices, id: \\.self) { index in
                    let row = rows[index]
                    SwiftUI.Text(verbatim: row.label)
                        .font(row.font)
                        .foregroundStyle(row.color)
                        .lineLimit(1)
                        .frame(height: max(0, row.frame.height - row.padding.top - row.padding.bottom), alignment: .leading)
                        .padding(row.padding)
                        .frame(width: row.frame.width, height: row.frame.height, alignment: .topLeading)
                        .background(row.background)
                        .clipped()
                        .offset(x: row.frame.minX - inset.leading, y: row.frame.minY - inset.top)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .clipped()
        }
        .allowsHitTesting(false)
    }
}
`;
