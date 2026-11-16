/// CSS relative positioning moves paint after text layout; adjacent runs retain their advances.
struct MarkswiftTextOffset: TextAttribute, Sendable, Hashable {
    let x: CGFloat
    let y: CGFloat
}

/// Text decorations (underline, strike, overline) with custom thickness, offset, and styles (wavy, double).
struct MarkswiftDecoration: TextAttribute, Sendable, Hashable {
    struct Line: Sendable, Hashable {
        var kind: String
        var style: String = "solid"
        var color: Color? = nil
        var thickness: CGFloat = 1.0
        var offset: CGFloat = 0.0
    }
    var lines: [Line]
}

struct MarkswiftTextRenderer: TextRenderer, Sendable {
    var x: CGFloat = 0
    var y: CGFloat = 0

    var displayPadding: EdgeInsets {
        EdgeInsets(top: y, leading: x, bottom: y, trailing: x)
    }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                var copy = context
                if let offset = run[MarkswiftTextOffset.self] {
                    copy.translateBy(x: offset.x, y: offset.y)
                }
                copy.draw(run)
                if let deco = run[MarkswiftDecoration.self] {
                    drawDecorations(deco, for: run, in: &copy)
                }
            }
        }
    }

    private func drawDecorations(_ deco: MarkswiftDecoration, for run: Text.Layout.Run, in context: inout GraphicsContext) {
        let b = run.typographicBounds
        let x0 = b.rect.minX
        let x1 = b.rect.maxX
        let baseline = b.origin.y
        let ascent = b.ascent
        for line in deco.lines {
            let y: CGFloat
            switch line.kind {
            case "underline":
                y = baseline + 1.5 + line.offset
            case "line-through":
                y = baseline - ascent * 0.35
            case "overline":
                y = baseline - ascent
            default:
                y = baseline
            }
            let t = max(0.5, line.thickness)
            let color = line.color ?? .primary
            switch line.style {
            case "double":
                let halfT = max(0.5, t * 0.6)
                let gap = max(1.0, t)
                var p1 = Path()
                p1.move(to: CGPoint(x: x0, y: y - gap / 2))
                p1.addLine(to: CGPoint(x: x1, y: y - gap / 2))
                context.stroke(p1, with: .color(color), lineWidth: halfT)
                var p2 = Path()
                p2.move(to: CGPoint(x: x0, y: y + gap / 2))
                p2.addLine(to: CGPoint(x: x1, y: y + gap / 2))
                context.stroke(p2, with: .color(color), lineWidth: halfT)
            case "dotted":
                var p = Path()
                p.move(to: CGPoint(x: x0, y: y))
                p.addLine(to: CGPoint(x: x1, y: y))
                context.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: t, lineCap: .round, dash: [0, t * 2]))
            case "dashed":
                var p = Path()
                p.move(to: CGPoint(x: x0, y: y))
                p.addLine(to: CGPoint(x: x1, y: y))
                context.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: t, dash: [t * 3, t * 2]))
            case "wavy":
                let step: CGFloat = max(3.0, t * 3.0)
                let amp: CGFloat = max(1.2, t * 0.6)
                var p = Path()
                var curX = x0
                p.move(to: CGPoint(x: curX, y: y))
                var up = true
                while curX < x1 {
                    let nextX = min(x1, curX + step)
                    let midX = (curX + nextX) / 2
                    let ctrlY = up ? y - amp : y + amp
                    p.addQuadCurve(to: CGPoint(x: nextX, y: y), control: CGPoint(x: midX, y: ctrlY))
                    curX = nextX
                    up.toggle()
                }
                context.stroke(p, with: .color(color), lineWidth: t)
            default: // solid
                var p = Path()
                p.move(to: CGPoint(x: x0, y: y))
                p.addLine(to: CGPoint(x: x1, y: y))
                context.stroke(p, with: .color(color), lineWidth: t)
            }
        }
    }
}

typealias MarkswiftOffsetTextRenderer = MarkswiftTextRenderer
