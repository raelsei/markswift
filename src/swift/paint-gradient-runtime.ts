/** Linear backgrounds and masks resolve CSS directions against their actual native bounds. */
export const PAINT_GRADIENT_RUNTIME = `
nonisolated enum MarkswiftCSSGradientLine {
    static func endpoints(angle: Double, corner: UnitPoint? = nil, size: CGSize) -> (start: UnitPoint, end: UnitPoint) {
        let w = size.width, h = size.height
        guard w.isFinite, h.isFinite, w > 0, h > 0 else { return (.center, .center) }
        let dx: CGFloat, dy: CGFloat
        if let corner {
            let norm = hypot(w, h)
            dx = (2 * corner.x - 1) * h / norm
            dy = (2 * corner.y - 1) * w / norm
        } else {
            let radians = CGFloat(angle) * .pi / 180
            dx = sin(radians)
            dy = -cos(radians)
        }
        let length = abs(w * dx) + abs(h * dy)
        let x = length * dx / (2 * w), y = length * dy / (2 * h)
        return (UnitPoint(x: 0.5 - x, y: 0.5 - y), UnitPoint(x: 0.5 + x, y: 0.5 + y))
    }
}

struct MarkswiftCSSLinearGradient: View {
    let stops: [Gradient.Stop]
    var stopPositions: [MarkswiftCSSGradientLength?]? = nil
    let angle: Double
    var corner: UnitPoint? = nil
    var perceptual: Bool = false

    var body: some View {
        GeometryReader { geometry in
            let line = MarkswiftCSSGradientLine.endpoints(angle: angle, corner: corner, size: geometry.size)
            let delta = CGPoint(x: line.end.x - line.start.x, y: line.end.y - line.start.y)
            let length = hypot(delta.x * geometry.size.width, delta.y * geometry.size.height)
            let resolved = MarkswiftCSSGradientStops.resolve(stops, positions: stopPositions, length: length)
            let span = MarkswiftCSSGradientStops.span(resolved)
            let fieldStops = MarkswiftCSSGradientStops.remap(resolved, lower: span.lower, upper: span.upper)
            let start = UnitPoint(x: line.start.x + delta.x * span.lower, y: line.start.y + delta.y * span.lower)
            let end = UnitPoint(x: line.start.x + delta.x * span.upper, y: line.start.y + delta.y * span.upper)
            // Legacy CSS gradients interpolate encoded sRGB components. SwiftUI's
            // default is perceptual; the explicit device space preserves these stops.
            Rectangle().fill(LinearGradient.linearGradient(
                Gradient(stops: fieldStops).colorSpace(perceptual ? .perceptual : .device),
                startPoint: start, endPoint: end))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
`;
