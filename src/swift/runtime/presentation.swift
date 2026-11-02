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
private struct MarkswiftDismissKey: EnvironmentKey { static let defaultValue: (@MainActor () -> Void)? = nil }
extension EnvironmentValues {
    var markswiftAnchors: [String: CGRect] {
        get { self[MarkswiftAnchorsKey.self] }
        set { self[MarkswiftAnchorsKey.self] = newValue }
    }
    var markswiftDismiss: (@MainActor () -> Void)? {
        get { self[MarkswiftDismissKey.self] }
        set { self[MarkswiftDismissKey.self] = newValue }
    }
}

private struct MarkswiftPlaced: ViewModifier {
    let placement: MarkswiftPlacement
    @Environment(\.markswiftAnchors) private var anchors
    @Environment(\.markswiftDismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dragOffset: CGSize = .zero

    private var reduce: Bool { reduceMotion }

    func body(content: Content) -> some View {
        switch placement {
        case .center: content.frame(maxWidth: .infinity, maxHeight: .infinity)
        case .edge(let e):
            let alignment: Alignment = e == .bottom ? .bottom : e == .top ? .top : e == .leading ? .leading : .trailing
            content
                .offset(dragOffset)
                .simultaneousGesture(edgeDragGesture(for: e))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
        case .offset(let o): content.offset(x: o.width, y: o.height)
        case .anchored(let id, let from, let to, let gap):
            let r = anchors[id] ?? .zero
            content
                .alignmentGuide(.leading) { d in d.width * to.x - (r.minX + r.width * from.x + gap.width) }
                .alignmentGuide(.top) { d in d.height * to.y - (r.minY + r.height * from.y + gap.height) }
        }
    }

    private func edgeDragGesture(for edge: Edge) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                switch edge {
                case .bottom:
                    if value.translation.height > 0 { dragOffset = CGSize(width: 0, height: value.translation.height) }
                case .top:
                    if value.translation.height < 0 { dragOffset = CGSize(width: 0, height: value.translation.height) }
                case .trailing:
                    if value.translation.width > 0 { dragOffset = CGSize(width: value.translation.width, height: 0) }
                case .leading:
                    if value.translation.width < 0 { dragOffset = CGSize(width: value.translation.width, height: 0) }
                }
            }
            .onEnded { value in
                let threshold: CGFloat = 80
                var shouldDismiss = false
                switch edge {
                case .bottom: shouldDismiss = value.translation.height > threshold
                case .top: shouldDismiss = value.translation.height < -threshold
                case .trailing: shouldDismiss = value.translation.width > threshold
                case .leading: shouldDismiss = value.translation.width < -threshold
                }
                if shouldDismiss {
                    dismiss?()
                } else {
                    if reduce {
                        dragOffset = .zero
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { dragOffset = .zero }
                    }
                }
            }
    }
}

private struct MarkswiftPresentationContainer<C: View>: View {
    @Binding var isPresented: Bool
    let modal: Bool
    let dismissOnEscape: Bool
    let dismissOnOutside: Bool
    let exit: Animation?
    let onDismiss: () -> Void
    let anchors: [String: CGRect]
    let proxy: GeometryProxy
    @ViewBuilder let content: () -> C

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var reduce: Bool { reduceMotion }

    private func dismiss() {
        if reduce {
            isPresented = false
        } else {
            withAnimation(exit) { isPresented = false }
        }
        onDismiss()
    }

    var body: some View {
        let shown = isPresented
        ZStack(alignment: .topLeading) {
            if shown {
                Color.clear.contentShape(Rectangle())
                    .onTapGesture { if dismissOnOutside { dismiss() } }
                    .allowsHitTesting(modal || dismissOnOutside)
                    .accessibilityHidden(true)
                content()
            }
        }
        .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        .environment(\.markswiftAnchors, anchors)
        .environment(\.markswiftDismiss, dismiss)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(modal && shown ? .isModal : [])
        .accessibilityHidden(!shown)
        .accessibilityAction(.escape) { if shown && dismissOnEscape { dismiss() } }
        .onKeyPress(.escape) { guard shown && dismissOnEscape else { return .ignored }; dismiss(); return .handled }
        .allowsHitTesting(shown)
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
                MarkswiftPresentationContainer(
                    isPresented: isPresented,
                    modal: modal,
                    dismissOnEscape: dismissOnEscape,
                    dismissOnOutside: dismissOnOutside,
                    exit: exit,
                    onDismiss: onDismiss,
                    anchors: anchors.mapValues { proxy[$0] },
                    proxy: proxy,
                    content: content
                )
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
