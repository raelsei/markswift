/// CSS relative positioning moves paint after text layout; adjacent runs retain their advances.
struct MarkswiftTextOffset: TextAttribute {
    let x: CGFloat
    let y: CGFloat
}

struct MarkswiftOffsetTextRenderer: TextRenderer {
    let x: CGFloat
    let y: CGFloat
    var displayPadding: EdgeInsets { EdgeInsets(top: y, leading: x, bottom: y, trailing: x) }
    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                var copy = context
                if let offset = run[MarkswiftTextOffset.self] {
                    copy.translateBy(x: offset.x, y: offset.y)
                }
                copy.draw(run)
            }
        }
    }
}
