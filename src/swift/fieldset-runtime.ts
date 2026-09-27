/** Native fieldset decoration, derived from Chrome's source equation and actual native anchors. */
export const FIELDSET_RUNTIME = `
nonisolated struct MarkswiftFieldsetLegendAnchor {
    var key: String
    var bounds: Anchor<CGRect>
    var relative: CGSize
}

nonisolated struct MarkswiftFieldsetLegendAnchors: PreferenceKey {
    static var defaultValue: [MarkswiftFieldsetLegendAnchor] { [] }
    static func reduce(value: inout [MarkswiftFieldsetLegendAnchor], nextValue: () -> [MarkswiftFieldsetLegendAnchor]) {
        value.append(contentsOf: nextValue())
    }
}

extension View {
    nonisolated func markswiftFieldsetLegend(_ key: String, relativeX: CGFloat, relativeY: CGFloat) -> some View {
        transformAnchorPreference(key: MarkswiftFieldsetLegendAnchors.self, value: .bounds) { values, anchor in
            values.append(MarkswiftFieldsetLegendAnchor(key: key, bounds: anchor, relative: CGSize(width: relativeX, height: relativeY)))
        }
    }
}

nonisolated struct MarkswiftFieldsetGeometry {
    var decoration: CGRect
    var cutout: CGRect
    // Chrome 154 FieldsetPaintInfo, horizontal-tb. No captured target positions participate.
    init(size: CGSize, legend: CGRect, borderWidth: CGFloat) {
        let top = max(0, (legend.height - borderWidth) / 2)
        decoration = CGRect(x: 0, y: top, width: max(0, size.width), height: max(0, size.height - top))
        cutout = CGRect(x: legend.minX, y: 0, width: legend.width, height: max(legend.height, borderWidth))
    }
}

nonisolated struct MarkswiftFieldsetBorderMask: Shape {
    var cutout: CGRect
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(rect)
        path.addRect(cutout)
        return path
    }
}

struct MarkswiftFieldsetBackground<S: SwiftUI.Shape>: ViewModifier {
    var legendKey: String
    var shape: S
    var fill: Color
    var borderWidth: CGFloat
    func body(content: Content) -> some View {
        content.backgroundPreferenceValue(MarkswiftFieldsetLegendAnchors.self) { anchors in
            GeometryReader { proxy in
                if let anchor = anchors.first(where: { $0.key == legendKey }) {
                    let legend = proxy[anchor.bounds].offsetBy(dx: -anchor.relative.width, dy: -anchor.relative.height)
                    let geometry = MarkswiftFieldsetGeometry(size: proxy.size, legend: legend, borderWidth: borderWidth)
                    shape.fill(fill)
                        .frame(width: geometry.decoration.width, height: geometry.decoration.height)
                        .offset(y: geometry.decoration.minY)
                }
            }.allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}

struct MarkswiftFieldsetBorder<S: SwiftUI.InsettableShape>: ViewModifier {
    var legendKey: String
    var shape: S
    var color: Color
    var width: CGFloat
    func body(content: Content) -> some View {
        content.overlayPreferenceValue(MarkswiftFieldsetLegendAnchors.self) { anchors in
            GeometryReader { proxy in
                if let anchor = anchors.first(where: { $0.key == legendKey }) {
                    let legend = proxy[anchor.bounds].offsetBy(dx: -anchor.relative.width, dy: -anchor.relative.height)
                    let geometry = MarkswiftFieldsetGeometry(size: proxy.size, legend: legend, borderWidth: width)
                    shape.strokeBorder(color, lineWidth: width)
                        .frame(width: geometry.decoration.width, height: geometry.decoration.height)
                        .offset(y: geometry.decoration.minY)
                        .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
                        .mask(alignment: .topLeading) {
                            MarkswiftFieldsetBorderMask(cutout: geometry.cutout)
                                .fill(Color.white, style: FillStyle(eoFill: true))
                                .frame(width: proxy.size.width, height: proxy.size.height)
                        }
                }
            }.allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}
`;
