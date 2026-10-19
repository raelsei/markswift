private struct MarkswiftHitAnchors: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}
private struct MarkswiftHitRects: PreferenceKey {
    static let defaultValue: [String: [CGRect]] = [:]
    static func reduce(value: inout [String: [CGRect]], nextValue: () -> [String: [CGRect]]) {
        value.merge(nextValue()) { $1 }
    }
}
private nonisolated struct MarkswiftHitShape: Shape {
    let rects: [CGRect]
    func path(in rect: CGRect) -> Path {
        var path = Path()
        for r in rects { path.addRect(r) }
        return path
    }
}
private struct MarkswiftHitRegion: ViewModifier {
    let id: String
    let targets: [String]
    @State private var rects: [CGRect] = []
    func body(content: Content) -> some View {
        content.backgroundPreferenceValue(MarkswiftHitAnchors.self) { anchors in
            GeometryReader { proxy in
                Color.clear.preference(key: MarkswiftHitRects.self,
                    value: [id: targets.compactMap { anchors[$0].map { proxy[$0] } }])
            }.allowsHitTesting(false)
        }
        .onPreferenceChange(MarkswiftHitRects.self) { rects = $0[id] ?? [] }
        .contentShape(MarkswiftHitShape(rects: rects))
    }
}
extension View {
    func markswiftHitTarget(_ id: String) -> some View {
        anchorPreference(key: MarkswiftHitAnchors.self, value: .bounds) { [id: $0] }
    }
    func markswiftHitRegion(_ id: String, targets: [String]) -> some View {
        modifier(MarkswiftHitRegion(id: id, targets: targets))
    }
}
