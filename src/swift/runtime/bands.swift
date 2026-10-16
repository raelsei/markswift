/// A CSS width breakpoint as the component root sees it: `atLeast` (`min-width`, `>=`) or `above` (`max-width`, `>`).
enum MarkswiftBandEdge: Sendable {
    case atLeast(CGFloat), above(CGFloat)
    /// Narrowest proposal that passes the edge: exactly `px`, or the next representable width above it.
    var minWidth: CGFloat {
        switch self {
        case .atLeast(let px): px
        case .above(let px): px.nextUp
        }
    }
}

extension EnvironmentValues {
    /// The width band `MarkswiftBands` chose; extracted row subviews read it.
    @Entry var markswiftBand: Int = 0
}

/// One ViewThatFits candidate: fits only when the offered width passes `minWidth`; never measures its content otherwise.
struct MarkswiftBandCandidate: Layout {
    let minWidth: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        guard let w = proposal.width, w.isFinite, w >= minWidth else { return CGSize(width: minWidth, height: 0) }
        return CGSize(width: w, height: child.sizeThatFits(ProposedViewSize(width: w, height: proposal.height)).height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}

/// Layout-time band selection: the widest band whose edge the proposed width passes; band 0 always fits.
struct MarkswiftBands<Content: View>: View {
    let edges: [MarkswiftBandEdge]
    @ViewBuilder let content: (Int) -> Content
    var body: some View {
        ViewThatFits(in: .horizontal) {
            ForEach(Array(edges.indices.reversed()), id: \.self) { i in
                MarkswiftBandCandidate(minWidth: edges[i].minWidth) { content(i + 1).environment(\.markswiftBand, i + 1) }
            }
            content(0).environment(\.markswiftBand, 0)
        }
    }
}
