/// Where a drawn presentation's content sits inside the component frame (plan 060).
enum MarkswiftPlacement: Sendable {
    case center, edge(Edge), offset(CGSize)
    case anchored(String, from: UnitPoint, to: UnitPoint, gap: CGSize)
}

struct MarkswiftAnchorKey: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

private struct MarkswiftAnchorsKey: EnvironmentKey { static let defaultValue: [String: CGRect] = [:] }
extension EnvironmentValues {
    var markswiftAnchors: [String: CGRect] {
        get { self[MarkswiftAnchorsKey.self] }
        set { self[MarkswiftAnchorsKey.self] = newValue }
    }
}

private struct MarkswiftPlaced: ViewModifier {
    let placement: MarkswiftPlacement
    @Environment(\.markswiftAnchors) private var anchors
    func body(content: Content) -> some View {
        switch placement {
        case .center: content.frame(maxWidth: .infinity, maxHeight: .infinity)
        case .edge(let e):
            content.frame(maxWidth: .infinity, maxHeight: .infinity,
                          alignment: e == .bottom ? .bottom : e == .top ? .top : e == .leading ? .leading : .trailing)
        case .offset(let o): content.offset(x: o.width, y: o.height)
        case .anchored(let id, let from, let to, let gap):
            let r = anchors[id] ?? .zero
            content
                .alignmentGuide(.leading) { d in d.width * to.x - (r.minX + r.width * from.x + gap.width) }
                .alignmentGuide(.top) { d in d.height * to.y - (r.minY + r.height * from.y + gap.height) }
        }
    }
}

extension View {
    func markswiftAnchor(_ id: String) -> some View {
        anchorPreference(key: MarkswiftAnchorKey.self, value: .bounds) { [id: $0] }
    }
    func markswiftPlaced(_ placement: MarkswiftPlacement) -> some View { modifier(MarkswiftPlaced(placement: placement)) }
    /// A presentation drawn over the component while `isPresented`; the screen owns the state (D-PRESENT-STATE).
    func markswiftPresentation<C: View>(
        isPresented: Binding<Bool>, modal: Bool, dismissOnEscape: Bool, dismissOnOutside: Bool,
        onDismiss: @escaping () -> Void, @ViewBuilder content: @escaping () -> C
    ) -> some View {
        overlayPreferenceValue(MarkswiftAnchorKey.self) { anchors in
            GeometryReader { proxy in
                if isPresented.wrappedValue {
                    let dismiss = { isPresented.wrappedValue = false; onDismiss() }
                    ZStack(alignment: .topLeading) {
                        if modal || dismissOnOutside {
                            Color.clear.contentShape(Rectangle())
                                .onTapGesture { if dismissOnOutside { dismiss() } }
                                .accessibilityHidden(true)
                        }
                        content()
                    }
                    .environment(\.markswiftAnchors, anchors.mapValues { proxy[$0] })
                    .accessibilityElement(children: .contain)
                    .accessibilityAddTraits(modal ? .isModal : [])
                    .accessibilityAction(.escape) { if dismissOnEscape { dismiss() } }
                    .onKeyPress(.escape) { guard dismissOnEscape else { return .ignored }; dismiss(); return .handled }
                }
            }
        }
    }
}
