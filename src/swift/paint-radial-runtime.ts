/** A circular field transformed into CSS's independently sized elliptical field. */
export const PAINT_RADIAL_RUNTIME = `
nonisolated enum MarkswiftCSSGradientLength {
    case points(CGFloat), fraction(CGFloat)
    func resolve(_ dimension: CGFloat) -> CGFloat {
        switch self {
        case .points(let value): return value
        case .fraction(let value): return value * dimension
        }
    }
}

nonisolated enum MarkswiftCSSRadialExtent {
    case closestSide, farthestSide, closestCorner, farthestCorner
    case explicit(MarkswiftCSSGradientLength, MarkswiftCSSGradientLength)

    func radii(center: CGPoint, size: CGSize, ellipse: Bool) -> CGSize {
        if case .explicit(let x, let y) = self {
            return CGSize(width: x.resolve(size.width), height: y.resolve(size.height))
        }
        let closest: Bool, corner: Bool
        switch self {
        case .closestSide: closest = true; corner = false
        case .farthestSide: closest = false; corner = false
        case .closestCorner: closest = true; corner = true
        default: closest = false; corner = true
        }
        let left = abs(center.x), right = abs(size.width - center.x)
        let top = abs(center.y), bottom = abs(size.height - center.y)
        let x = closest ? min(left, right) : max(left, right)
        let y = closest ? min(top, bottom) : max(top, bottom)
        if ellipse {
            let scale: CGFloat = corner ? sqrt(2) : 1
            return CGSize(width: x * scale, height: y * scale)
        }
        let radius = corner ? hypot(x, y) : (closest ? min(x, y) : max(x, y))
        return CGSize(width: radius, height: radius)
    }
}

struct MarkswiftCSSRadialGradient: View {
    let stops: [Gradient.Stop]
    var center: UnitPoint = .center
    var ellipse: Bool = true
    var position: (MarkswiftCSSGradientLength, MarkswiftCSSGradientLength)? = nil
    var extent: MarkswiftCSSRadialExtent = .farthestCorner
    var perceptual: Bool = false

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let point = CGPoint(x: position?.0.resolve(size.width) ?? center.x * size.width,
                                y: position?.1.resolve(size.height) ?? center.y * size.height)
            let radii = extent.radii(center: point, size: size, ellipse: ellipse)
            if size.width > 0, size.height > 0, radii.width > 0, radii.height > 0 {
                let scale = radii.height / radii.width
                Rectangle().fill(RadialGradient.radialGradient(
                    Gradient(stops: stops).colorSpace(perceptual ? .perceptual : .device),
                    center: UnitPoint(x: point.x / size.width, y: point.y / size.height),
                    startRadius: 0, endRadius: radii.width))
                    .frame(width: size.width, height: size.height / scale)
                    .scaleEffect(x: 1, y: scale, anchor: .topLeading)
                    .frame(width: size.width, height: size.height, alignment: .topLeading)
            } else {
                Rectangle().fill(stops.last?.color ?? .clear)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
`;
