import SwiftUI

/// Viewport orientation for CSS media queries.
enum MarkswiftOrientation: Sendable {
    case portrait, landscape
}

/// A CSS breakpoint as the component root sees it: width, height, or orientation.
enum MarkswiftBandEdge: Sendable {
    case atLeast(CGFloat), above(CGFloat)
    case atLeastHeight(CGFloat), aboveHeight(CGFloat)
    case orientation(MarkswiftOrientation)

    nonisolated var isWidthOnly: Bool {
        switch self {
        case .atLeast, .above: true
        case .atLeastHeight, .aboveHeight, .orientation: false
        }
    }

    /// Narrowest proposal that passes the edge: exactly `px`, or the next representable width above it.
    nonisolated var minWidth: CGFloat {
        switch self {
        case .atLeast(let px): px
        case .above(let px): px.nextUp
        case .atLeastHeight, .aboveHeight, .orientation: 0
        }
    }

    nonisolated func passes(width: CGFloat?, height: CGFloat?) -> Bool {
        switch self {
        case .atLeast(let px):
            guard let w = width, w.isFinite else { return false }
            return w >= px
        case .above(let px):
            guard let w = width, w.isFinite else { return false }
            return w > px
        case .atLeastHeight(let px):
            guard let h = height, h.isFinite else { return false }
            return h >= px
        case .aboveHeight(let px):
            guard let h = height, h.isFinite else { return false }
            return h > px
        case .orientation(.landscape):
            guard let w = width, let h = height, w.isFinite, h.isFinite else { return false }
            return w > h
        case .orientation(.portrait):
            guard let w = width, let h = height, w.isFinite, h.isFinite else { return false }
            return h >= w
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

/// Layout-time band selection: the widest band whose edge the proposed size passes; band 0 always fits.
struct MarkswiftBands<Content: View>: View {
    let edges: [MarkswiftBandEdge]
    @ViewBuilder let content: (Int) -> Content

    private var isPureWidth: Bool {
        edges.allSatisfy(\.isWidthOnly)
    }

    private func bandIndex(for width: CGFloat, height: CGFloat) -> Int {
        for i in edges.indices.reversed() {
            if edges[i].passes(width: width, height: height) {
                return i + 1
            }
        }
        return 0
    }

    var body: some View {
        if isPureWidth {
            ViewThatFits(in: .horizontal) {
                ForEach(Array(edges.indices.reversed()), id: \.self) { i in
                    MarkswiftBandCandidate(minWidth: edges[i].minWidth) {
                        content(i + 1).environment(\.markswiftBand, i + 1)
                    }
                }
                content(0).environment(\.markswiftBand, 0)
            }
        } else {
            GeometryReader { proxy in
                let b = bandIndex(for: proxy.size.width, height: proxy.size.height)
                content(b).environment(\.markswiftBand, b)
            }
        }
    }
}
