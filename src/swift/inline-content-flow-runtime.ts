/** Ordinary one-widget word flow. Reported positions/guides are Layout observations only. */
export const INLINE_CONTENT_FLOW_RUNTIME = `
nonisolated struct MarkswiftInlineContentAdvance: LayoutValueKey { static let defaultValue: CGFloat? = nil }
nonisolated struct MarkswiftInlineContentObservation: Codable, Sendable {
    struct Item: Codable, Sendable {
        var index: Int
        var line: Int
        var x: Double
        var y: Double
        var width: Double
        var height: Double
        var firstBaseline: Double?
        var lastBaseline: Double?
        var advance: Double
        var separatorAdvance: Double
        var emission: String?
        var sourceRange: [Int]?
        var separatorEmission: String?
        var separatorSourceRange: [Int]?
    }
    var id: String
    var phase: String
    var proposalWidth: Double?
    var available: Bool
    var reason: String?
    var usedSourceStrut: Bool
    var items: [Item]
    var session = 0
    var sequence = 0
    var mountedView: String?
}
nonisolated final class MarkswiftInlineContentCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var observations: [MarkswiftInlineContentObservation] = []
    private var session = 0
    private var sequence = 0
    private var mountedView: String?
    func startSession(view: String) { lock.lock(); defer { lock.unlock() }; session += 1; mountedView = view }
    func record(_ value: MarkswiftInlineContentObservation) {
        lock.lock(); defer { lock.unlock() }; sequence += 1
        var value = value; value.session = session; value.sequence = sequence; value.mountedView = mountedView
        observations.append(value)
    }
    func encoded() throws -> Data {
        lock.lock(); defer { lock.unlock() }
        struct Report: Encodable {
            var observations: [MarkswiftInlineContentObservation]
            let scope = "actual Layout word-wrapper guides, advances and local placement; not glyph ink or TextRenderer coordinates"
            let finalDrawSelection = "unavailable: Layout calls do not certify final draws"
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(Report(observations: observations))
    }
}
private struct MarkswiftInlineContentObserverKey: EnvironmentKey {
    static let defaultValue: MarkswiftInlineContentCollector? = nil
}
extension EnvironmentValues {
    var markswiftInlineContentObserver: MarkswiftInlineContentCollector? {
        get { self[MarkswiftInlineContentObserverKey.self] }
        set { self[MarkswiftInlineContentObserverKey.self] = newValue }
    }
}
extension View {
    func markswiftObserveInlineContent(_ collector: MarkswiftInlineContentCollector) -> some View {
        environment(\\.markswiftInlineContentObserver, collector)
    }
}
struct MarkswiftInlineContentRow<Content: View>: View {
    var id: String
    var strutAscent: CGFloat
    var strutDescent: CGFloat
    var wordCount: Int
    var space: CGFloat
    var margins: [CGFloat]
    var textBaseline: CGFloat
    var textDescent: CGFloat
    var wordKeys: [String] = []
    var separatorKeys: [String] = []
    var wordRanges: [[Int]] = []
    var separatorRanges: [[Int]] = []
    @ViewBuilder var content: () -> Content
    @Environment(\\.markswiftInlineContentObserver) private var observer
    var body: some View {
        MarkswiftInlineContentLayout(id: id, strutAscent: strutAscent, strutDescent: strutDescent,
            wordCount: wordCount, space: space, margins: margins, textBaseline: textBaseline,
            textDescent: textDescent, wordKeys: wordKeys, separatorKeys: separatorKeys,
            wordRanges: wordRanges, separatorRanges: separatorRanges, observer: observer) { content() }
    }
}
struct MarkswiftInlineContentLayout: Layout {
    var id: String
    var strutAscent: CGFloat
    var strutDescent: CGFloat
    var wordCount: Int
    var space: CGFloat
    var margins: [CGFloat]
    var textBaseline: CGFloat
    var textDescent: CGFloat
    var wordKeys: [String] = []
    var separatorKeys: [String] = []
    var wordRanges: [[Int]] = []
    var separatorRanges: [[Int]] = []
    var observer: MarkswiftInlineContentCollector?
    private struct Measurement {
        var dimensions: [ViewDimensions]
        var positions: [CGPoint]
        var size: CGSize
        var first: CGFloat
        var last: CGFloat
    }
    private func measure(_ proposal: ProposedViewSize, _ subviews: Subviews, phase: String) -> Measurement {
        let dimensions = subviews.map { $0.dimensions(in: .unspecified) }
        guard !dimensions.isEmpty else { return Measurement(dimensions: [], positions: [], size: .zero, first: 0, last: 0) }
        var reason: String? = subviews.count == wordCount + 1 && margins.count == 4 ? nil : "native-inline-membership-mismatch"
        if !space.isFinite || space < 0 || !strutAscent.isFinite || !strutDescent.isFinite
            || strutAscent < 0 || strutDescent < 0 || margins.contains(where: { !$0.isFinite || $0 < 0 }) {
            reason = reason ?? "native-inline-input-unavailable"
        }
        let m = margins.count == 4 && margins.allSatisfy({ $0.isFinite && $0 >= 0 }) ? margins : [0, 0, 0, 0]
        let availableWidth = proposal.width.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
        for (index, d) in dimensions.enumerated() {
            let first = d[.firstTextBaseline], last = d[.lastTextBaseline]
            if !first.isFinite || !last.isFinite || first < 0 || first > d.height || !d.width.isFinite || !d.height.isFinite {
                reason = reason ?? "native-inline-guide-unavailable"
            } else if index > 0 && (abs(first - textBaseline) > 0.5 || abs(d.height - first - textDescent) > 0.5 || abs(last - first) > 0.5) {
                reason = reason ?? "native-inline-font-box-mismatch"
            }
        }
        let valid = reason == nil
        var lines: [[Int]] = [[0]], xs = [CGFloat](repeating: 0, count: dimensions.count)
        var separators = [CGFloat](repeating: 0, count: dimensions.count)
        var advances = dimensions.map { $0.width }
        xs[0] = m[3]
        var x = m[3] + dimensions[0].width + m[1]
        for index in dimensions.indices.dropFirst() {
            let supplied = subviews[index][MarkswiftInlineContentAdvance.self]
            let advance = supplied.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil } ?? dimensions[index].width
            advances[index] = advance
            var separator = space.isFinite && space >= 0 ? space : 0
            if let width = availableWidth, x + separator + advance > width, !lines.last!.isEmpty {
                lines.append([]); x = 0; separator = 0
            }
            xs[index] = x + separator; separators[index] = separator
            lines[lines.count - 1].append(index); x += separator + advance
        }
        var positions = [CGPoint](repeating: .zero, count: dimensions.count), observations: [MarkswiftInlineContentObservation.Item] = []
        var y: CGFloat = 0, naturalWidth: CGFloat = 0, firstBaseline: CGFloat = 0, lastBaseline: CGFloat = 0
        for (line, indices) in lines.enumerated() {
            var ascent = valid ? strutAscent : 0, descent = valid ? strutDescent : 0
            for index in indices {
                let d = dimensions[index], first = nativeGuide(d)
                ascent = max(ascent, first + (index == 0 ? m[0] : 0))
                descent = max(descent, d.height - first + (index == 0 ? m[2] : 0))
            }
            if line == 0 { firstBaseline = ascent }
            lastBaseline = y + ascent
            for index in indices {
                let d = dimensions[index], first = d[.firstTextBaseline], last = d[.lastTextBaseline]
                positions[index] = CGPoint(x: xs[index], y: y + ascent - nativeGuide(d))
                naturalWidth = max(naturalWidth, xs[index] + advances[index] + (index == 0 ? m[1] : 0))
                observations.append(.init(index: index, line: line, x: Double(positions[index].x), y: Double(positions[index].y),
                    width: Double(d.width), height: Double(d.height), firstBaseline: first.isFinite ? Double(first) : nil,
                    lastBaseline: last.isFinite ? Double(last) : nil, advance: Double(advances[index]), separatorAdvance: Double(separators[index]),
                    emission: index > 0 && index <= wordKeys.count ? wordKeys[index - 1] : nil,
                    sourceRange: index > 0 && index <= wordRanges.count ? wordRanges[index - 1] : nil,
                    separatorEmission: index > 0 && index <= separatorKeys.count ? separatorKeys[index - 1] : nil,
                    separatorSourceRange: index > 0 && index <= separatorRanges.count ? separatorRanges[index - 1] : nil))
            }
            y += ascent + descent
        }
        observer?.record(.init(id: id, phase: phase, proposalWidth: availableWidth.map(Double.init), available: valid, reason: reason, usedSourceStrut: valid, items: observations))
        return Measurement(dimensions: dimensions, positions: positions, size: CGSize(width: availableWidth ?? naturalWidth, height: y), first: firstBaseline, last: lastBaseline)
    }
    private func nativeGuide(_ d: ViewDimensions) -> CGFloat {
        let value = d[.firstTextBaseline]
        return value.isFinite && value >= 0 && value <= d.height ? value : d.height
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { measure(proposal, subviews, phase: "sizeThatFits").size }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = measure(ProposedViewSize(width: bounds.width, height: nil), subviews, phase: "placeSubviews")
        for index in measured.dimensions.indices {
            let d = measured.dimensions[index], p = measured.positions[index]
            subviews[index].place(at: CGPoint(x: bounds.minX + p.x, y: bounds.minY + p.y), anchor: .topLeading,
                proposal: ProposedViewSize(width: d.width, height: d.height))
        }
    }
    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        let measured = measure(proposal, subviews, phase: "explicitAlignment")
        if guide == .firstTextBaseline { return measured.first }
        if guide == .lastTextBaseline { return measured.last }
        return nil
    }
}
`;
