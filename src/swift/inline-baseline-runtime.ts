/** Source CSS struts are inputs; reported native guides/dimensions are actual Layout observations. */
export const INLINE_BASELINE_RUNTIME = `
nonisolated struct MarkswiftInlineBaselineItem: Sendable {
    var widget: Bool
    var baseline: CGFloat
    var height: CGFloat
    var top: CGFloat
    var bottom: CGFloat
}

nonisolated struct MarkswiftInlineBaselineObservation: Codable, Sendable {
    struct Child: Codable, Sendable {
        var guideKind: String
        var width: Double
        var height: Double
        var firstBaseline: Double?
        var lastBaseline: Double?
    }
    var id: String
    var available: Bool
    var reason: String?
    var usedSourceStrut: Bool
    var children: [Child]
    var phase: String
    var proposalWidth: Double?
    var proposalHeight: Double?
    var session: Int = 0
    var sequence: Int = 0
    var mountedView: String? = nil
}

/// Optional passive verification: no SwiftUI state mutation, coordinates, or alignment targets.
nonisolated final class MarkswiftInlineBaselineCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var observations: [MarkswiftInlineBaselineObservation] = []
    private var session = 0
    private var sequence = 0
    private var mountedView: String?
    /// A harness names each independently mounted view; previous sessions remain observable.
    func startSession(view: String) {
        lock.lock(); defer { lock.unlock() }
        session += 1; mountedView = view
    }
    func record(_ value: MarkswiftInlineBaselineObservation) {
        lock.lock(); defer { lock.unlock() }
        sequence += 1
        var recorded = value
        recorded.session = session; recorded.sequence = sequence; recorded.mountedView = mountedView
        observations.append(recorded)
    }
    func snapshot() -> [MarkswiftInlineBaselineObservation] {
        lock.lock(); defer { lock.unlock() }; return observations
    }
    func encoded() throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        struct Report: Encodable {
            var observations: [MarkswiftInlineBaselineObservation]
            let finalDrawSelection = "unavailable: Layout measurement/placement calls are not certified final draws"
            let textGuideScope = "text-line-box-wrapper; not actual glyph ink or TextRenderer run geometry"
        }
        return try encoder.encode(Report(observations: snapshot()))
    }
}
private struct MarkswiftInlineBaselineObserverKey: EnvironmentKey {
    static let defaultValue: MarkswiftInlineBaselineCollector? = nil
}
extension EnvironmentValues {
    var markswiftInlineBaselineObserver: MarkswiftInlineBaselineCollector? {
        get { self[MarkswiftInlineBaselineObserverKey.self] }
        set { self[MarkswiftInlineBaselineObserverKey.self] = newValue }
    }
}
extension View {
    func markswiftObserveInlineBaselines(_ collector: MarkswiftInlineBaselineCollector) -> some View {
        environment(\\.markswiftInlineBaselineObserver, collector)
    }
}

struct MarkswiftInlineBaselineRow<Content: View>: View {
    var id: String
    var strutAscent: CGFloat
    var strutDescent: CGFloat
    var items: [MarkswiftInlineBaselineItem]
    var spacing: [CGFloat]
    var leading: CGFloat
    @ViewBuilder var content: () -> Content
    @Environment(\\.markswiftInlineBaselineObserver) private var observer
    var body: some View {
        MarkswiftInlineBaselineLayout(id: id, strutAscent: strutAscent, strutDescent: strutDescent,
                                     items: items, spacing: spacing, leading: leading, observer: observer) { content() }
    }
}

struct MarkswiftInlineBaselineLayout: Layout {
    var id: String
    var strutAscent: CGFloat
    var strutDescent: CGFloat
    var items: [MarkswiftInlineBaselineItem]
    var spacing: [CGFloat]
    var leading: CGFloat
    var observer: MarkswiftInlineBaselineCollector?
    private struct Measurement {
        var dimensions: [ViewDimensions]
        var baseline: CGFloat
        var lastBaseline: CGFloat
        var size: CGSize
    }

    private func measure(_ proposal: ProposedViewSize, _ subviews: Subviews, phase: String) -> Measurement {
        let width = proposal.width.flatMap { $0.isFinite ? Double($0) : nil }
        let height = proposal.height.flatMap { $0.isFinite ? Double($0) : nil }
        let count = subviews.count
        guard count > 0 else {
            observer?.record(MarkswiftInlineBaselineObservation(id: id, available: false, reason: "native-child-membership-mismatch", usedSourceStrut: false, children: [], phase: phase, proposalWidth: width, proposalHeight: height))
            return Measurement(dimensions: [], baseline: 0, lastBaseline: 0, size: .zero)
        }
        var dimensions = subviews.map { $0.dimensions(in: .unspecified) }
        let membership = count == items.count
        let contracts = membership ? items : dimensions.map { MarkswiftInlineBaselineItem(widget: true, baseline: $0.height, height: $0.height, top: 0, bottom: 0) }
        let gaps = spacing.prefix(max(0, count - 1)).reduce(CGFloat.zero, +)
        let fixedWidth = zip(dimensions, contracts).filter { $0.1.widget }.reduce(CGFloat.zero) { $0 + $1.0.width }
        let textCount = contracts.filter { !$0.widget }.count
        if let width = proposal.width, textCount > 0 {
            let remaining = max(0, width - leading - gaps - fixedWidth) / CGFloat(textCount)
            for index in dimensions.indices where !contracts[index].widget {
                dimensions[index] = subviews[index].dimensions(in: ProposedViewSize(width: remaining, height: nil))
            }
        }
        var reason: String? = membership ? nil : "native-child-membership-mismatch"
        let observations = dimensions.indices.map { index -> MarkswiftInlineBaselineObservation.Child in
            let d = dimensions[index], item = contracts[index]
            let first = d[.firstTextBaseline], last = d[.lastTextBaseline]
            if !first.isFinite || !last.isFinite || !d.height.isFinite || first < 0 || first > d.height {
                reason = reason ?? "native-guide-unavailable"
            } else if !item.widget && abs(last - first) > 0.5 {
                reason = reason ?? "native-inline-text-multiline"
            } else if abs(first - item.baseline) > 0.5 || abs(d.height - item.height) > 0.5 {
                reason = reason ?? "native-baseline-guide-mismatch"
            }
            return .init(guideKind: !membership ? "unclassified-native-subview" : item.widget ? "native-widget" : "text-line-box-wrapper", width: Double(d.width), height: Double(d.height), firstBaseline: first.isFinite ? Double(first) : nil, lastBaseline: last.isFinite ? Double(last) : nil)
        }
        let available = reason == nil
        // On mismatch/new wrapping the old single-line CSS strut is explicitly discarded.
        var baseline = available ? strutAscent : 0
        var descent = available ? strutDescent : 0
        for index in dimensions.indices {
            let d = dimensions[index], guide = nativeGuide(d)
            baseline = max(baseline, guide + contracts[index].top)
            descent = max(descent, d.height - guide + contracts[index].bottom)
        }
        let last = baseline + dimensions.map { $0[.lastTextBaseline].isFinite ? max(0, $0[.lastTextBaseline] - nativeGuide($0)) : 0 }.max()!
        observer?.record(.init(id: id, available: available, reason: reason, usedSourceStrut: available, children: observations, phase: phase, proposalWidth: width, proposalHeight: height))
        let naturalWidth = leading + gaps + dimensions.reduce(CGFloat.zero) { $0 + $1.width }
        return Measurement(dimensions: dimensions, baseline: baseline, lastBaseline: last,
                           size: CGSize(width: proposal.width ?? naturalWidth, height: baseline + descent))
    }
    private func nativeGuide(_ dimensions: ViewDimensions) -> CGFloat {
        let guide = dimensions[.firstTextBaseline]
        return guide.isFinite && guide >= 0 && guide <= dimensions.height ? guide : dimensions.height
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        measure(proposal, subviews, phase: "sizeThatFits").size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = measure(ProposedViewSize(width: bounds.width, height: nil), subviews, phase: "placeSubviews")
        var x = bounds.minX + leading
        for index in measured.dimensions.indices {
            let d = measured.dimensions[index], guide = nativeGuide(d)
            subviews[index].place(at: CGPoint(x: x, y: bounds.minY + measured.baseline - guide), anchor: .topLeading,
                                 proposal: ProposedViewSize(width: d.width, height: d.height))
            x += d.width + (index < spacing.count ? spacing[index] : 0)
        }
    }
    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        let measured = measure(proposal, subviews, phase: "explicitAlignment")
        if guide == .firstTextBaseline { return measured.baseline }
        if guide == .lastTextBaseline { return measured.lastBaseline }
        return nil
    }
}
`;
