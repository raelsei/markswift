/** Captured HTML disclosure geometry, with a native Button trigger and live accessibility state. */
export const MARKSWIFT_DISCLOSURE_RUNTIME = `
private struct MarkswiftDisclosureExpandedKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}
extension EnvironmentValues {
    var markswiftDisclosureExpanded: Bool? {
        get { self[MarkswiftDisclosureExpandedKey.self] }
        set { self[MarkswiftDisclosureExpandedKey.self] = newValue }
    }
}

struct MarkswiftDisclosure<Label: View, Content: View>: View {
    @Binding var isExpanded: Bool
    let gap: CGFloat
    let labelInset: CGFloat
    let contentInset: CGFloat
    let contentAvailable: Bool
    let summaryIdentifier: String
    let contentIdentifier: String
    @ViewBuilder let content: () -> Content
    @ViewBuilder let label: () -> Label

    var body: some View {
        VStack(alignment: .leading, spacing: gap) {
            SwiftUI.Button { isExpanded.toggle() } label: {
                label().environment(\\.markswiftDisclosureExpanded, isExpanded)
            }
            .buttonStyle(.plain)
            .accessibilityValue(isExpanded ? "expanded" : "collapsed")
            .accessibilityIdentifier(summaryIdentifier)
            .padding(.leading, labelInset)
            if isExpanded && contentAvailable {
                content().padding(.leading, contentInset)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier(contentIdentifier)
            }
        }
    }
}

/// Blink canonical disclosure path; the rect is measured in the summary marker viewport.
struct MarkswiftDisclosureSymbol: View {
    @Environment(\\.markswiftDisclosureExpanded) private var expanded
    let capturedExpanded: Bool
    let symbolRect: CGRect
    let viewport: CGSize
    let color: SwiftUI.Color

    var body: some View {
        MarkswiftDisclosureTriangle(expanded: expanded ?? capturedExpanded, symbolRect: symbolRect)
            .fill(color)
            .frame(width: viewport.width, height: viewport.height)
            .accessibilityHidden(true)
    }
}

nonisolated struct MarkswiftDisclosureTriangle: SwiftUI.Shape {
    let expanded: Bool
    let symbolRect: CGRect
    func path(in rect: CGRect) -> SwiftUI.Path {
        let points: [CGPoint] = expanded
            ? [CGPoint(x: 0, y: 0.07), CGPoint(x: 0.5, y: 0.93), CGPoint(x: 1, y: 0.07)]
            : [CGPoint(x: 0, y: 0), CGPoint(x: 0.86, y: 0.5), CGPoint(x: 0, y: 1)]
        var path = SwiftUI.Path()
        path.addLines(points.map { CGPoint(x: symbolRect.minX + $0.x * symbolRect.width,
                                         y: symbolRect.minY + $0.y * symbolRect.height) })
        path.closeSubpath()
        return path
    }
}`;
