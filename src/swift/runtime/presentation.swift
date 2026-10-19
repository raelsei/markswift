/// Where a drawn presentation's content sits inside the component frame.
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
    /// A presentation drawn over the component while `isPresented`; the screen owns the state.
    /// The container stays while closed so each root's own removal transition plays; `exit` animates the
    /// runtime's own dismissal (Escape, an outside tap).
    func markswiftPresentation<C: View>(
        isPresented: Binding<Bool>, modal: Bool, dismissOnEscape: Bool, dismissOnOutside: Bool, exit: Animation? = nil,
        onDismiss: @escaping () -> Void, @ViewBuilder content: @escaping () -> C
    ) -> some View {
        overlayPreferenceValue(MarkswiftAnchorKey.self) { anchors in
            GeometryReader { proxy in
                let shown = isPresented.wrappedValue
                let dismiss = { withAnimation(exit) { isPresented.wrappedValue = false }; onDismiss() }
                ZStack(alignment: .topLeading) {
                    if shown {
                        // The full-size base the placements align to (a ZStack aligns its children to one another).
                        // It takes the taps outside the content only when they must not reach the page.
                        Color.clear.contentShape(Rectangle())
                            .onTapGesture { if dismissOnOutside { dismiss() } }
                            .allowsHitTesting(modal || dismissOnOutside)
                            .accessibilityHidden(true)
                        content()
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
                .environment(\.markswiftAnchors, anchors.mapValues { proxy[$0] })
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(modal && shown ? .isModal : [])
                .accessibilityHidden(!shown)
                .accessibilityAction(.escape) { if shown && dismissOnEscape { dismiss() } }
                .onKeyPress(.escape) { guard shown && dismissOnEscape else { return .ignored }; dismiss(); return .handled }
                .allowsHitTesting(shown)
            }
        }
    }
}

/// Resolves CSS percentage/calc width before asking the content for its wrapping height.
struct MarkswiftPresentationWidth: Layout {
    let fraction: CGFloat
    let offset: CGFloat
    let minimum: CGFloat
    let maximum: CGFloat
    func width(_ offered: CGFloat?) -> CGFloat? {
        offered.map { max(minimum, min(maximum, max(0, $0 * fraction + offset))) }
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let w = width(proposal.width)
        let size = child.sizeThatFits(ProposedViewSize(width: w, height: nil))
        return CGSize(width: w ?? size.width, height: size.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: nil))
    }
}
