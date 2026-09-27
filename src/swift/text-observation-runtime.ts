/** Verification-only passive observations; compiled only for textInstrumentation. */
export const TEXT_OBSERVATION_RUNTIME = `import SwiftUI
import Foundation

nonisolated struct MarkswiftObservedTextSlice: Codable, Sendable {
    var ordinal: Int
    var relativeCharacterIndices: [Int]
    var bounds: [Double]
    var baseline: [Double]
}

nonisolated struct MarkswiftObservedTextRun: Codable, Sendable {
    var ordinal: Int
    var emission: String?
    var literal: String?
    var fontBinding: String?
    var characterIndexScope = "run-first-relative-unproven"
    var relativeCharacterIndices: [Int]
    var layoutDirection: String
    var bounds: [Double]
    var baseline: [Double]
    var slices: [MarkswiftObservedTextSlice]
}

nonisolated struct MarkswiftObservedTextLine: Codable, Sendable {
    var ordinal: Int
    var indexScope = "layout-line-local"
    var origin: [Double]
    var bounds: [Double]
    var runs: [MarkswiftObservedTextRun]
}

nonisolated struct MarkswiftObservedTextDraw: Codable, Sendable {
    var session: Int
    var draw: Int
    var view: String
    var truncated: Bool
    var scopeStatus = "source-hard-line and cluster mapping require independent native proof"
    var lines: [MarkswiftObservedTextLine]
}

nonisolated struct MarkswiftObservedTextFrame: Codable, Equatable, Sendable {
    var key: String
    var x: Double
    var y: Double
    var w: Double
    var h: Double
}

/// Recording never updates SwiftUI state, substitutes expected boxes, or discards repeated draws.
nonisolated final class MarkswiftTextObservationCollector: @unchecked Sendable {
    static let shared = MarkswiftTextObservationCollector()
    private let lock = NSLock()
    private var session = 0
    private var draw = 0
    private var draws: [MarkswiftObservedTextDraw] = []
    private var frameRevisions: [[MarkswiftObservedTextFrame]] = []

    func startSession() {
        lock.lock(); defer { lock.unlock() }
        session += 1; draw = 0; draws = []; frameRevisions = []
    }
    func append(view: String, truncated: Bool, lines: [MarkswiftObservedTextLine]) {
        lock.lock(); defer { lock.unlock() }
        draw += 1
        draws.append(MarkswiftObservedTextDraw(session: session, draw: draw, view: view, truncated: truncated, lines: lines))
    }
    func appendFrames(_ frames: [MarkswiftObservedTextFrame]) {
        lock.lock(); defer { lock.unlock() }
        frameRevisions.append(frames)
    }
    func encoded() throws -> Data {
        struct Payload: Encodable {
            var version = 1
            var frameCoordinateSpace = "observed-root-local"
            var drawCoordinateSpace = "text-layout-local; root mapping unproved"
            var frameKind = "actual-text-view-aabb"
            var finalDrawSelection = "unavailable; every draw retained"
            var session: Int
            var draws: [MarkswiftObservedTextDraw]
            var frameRevisions: [[MarkswiftObservedTextFrame]]
        }
        lock.lock(); defer { lock.unlock() }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(Payload(session: session, draws: draws, frameRevisions: frameRevisions))
    }
}

@available(iOS 18.0, macOS 15.0, tvOS 18.0, watchOS 11.0, *)
nonisolated struct MarkswiftTextSourceAttribute: TextAttribute {
    var emission: String
    var literal: String
    var fontBinding: String
}

@available(iOS 18.0, macOS 15.0, tvOS 18.0, watchOS 11.0, *)
nonisolated struct MarkswiftPassiveTextRenderer: TextRenderer {
    var view: String
    func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
        func rect(_ value: CGRect) -> [Double] { [Double(value.minX), Double(value.minY), Double(value.width), Double(value.height)] }
        var lines: [MarkswiftObservedTextLine] = []
        for (lineOrdinal, line) in layout.enumerated() {
            var runs: [MarkswiftObservedTextRun] = []
            for (runOrdinal, run) in line.enumerated() {
                let attribute = run[MarkswiftTextSourceAttribute.self]
                let first = run.characterIndices.first
                let relative = run.characterIndices.map { first?.distance(to: $0) ?? 0 }
                var slices: [MarkswiftObservedTextSlice] = []
                for (sliceOrdinal, slice) in run.enumerated() {
                    slices.append(MarkswiftObservedTextSlice(ordinal: sliceOrdinal,
                        relativeCharacterIndices: slice.characterIndices.map { first?.distance(to: $0) ?? 0 },
                        bounds: rect(slice.typographicBounds.rect), baseline: [Double(slice.typographicBounds.origin.x), Double(slice.typographicBounds.origin.y)]))
                }
                runs.append(MarkswiftObservedTextRun(ordinal: runOrdinal, emission: attribute?.emission, literal: attribute?.literal, fontBinding: attribute?.fontBinding,
                    relativeCharacterIndices: relative, layoutDirection: run.layoutDirection == .rightToLeft ? "rtl" : "ltr",
                    bounds: rect(run.typographicBounds.rect), baseline: [Double(run.typographicBounds.origin.x), Double(run.typographicBounds.origin.y)], slices: slices))
            }
            lines.append(MarkswiftObservedTextLine(ordinal: lineOrdinal, origin: [Double(line.origin.x), Double(line.origin.y)], bounds: rect(line.typographicBounds.rect), runs: runs))
            ctx.draw(line)
        }
        MarkswiftTextObservationCollector.shared.append(view: view, truncated: layout.isTruncated, lines: lines)
    }
    func sizeThatFits(proposal: ProposedViewSize, text: TextProxy) -> CGSize { text.sizeThatFits(proposal) }
    var displayPadding: EdgeInsets { EdgeInsets() }
}

extension Text {
    nonisolated func markswiftTextSource(_ emission: String, _ literal: String, fontBinding: String) -> Text {
        if #available(iOS 18.0, macOS 15.0, tvOS 18.0, watchOS 11.0, *) {
            return customAttribute(MarkswiftTextSourceAttribute(emission: emission, literal: literal, fontBinding: fontBinding))
        }
        return self
    }
}

nonisolated struct MarkswiftTextObservationAnchor {
    var key: String
    var bounds: Anchor<CGRect>
}
nonisolated struct MarkswiftTextObservationAnchors: PreferenceKey {
    static var defaultValue: [MarkswiftTextObservationAnchor] { [] }
    static func reduce(value: inout [MarkswiftTextObservationAnchor], nextValue: () -> [MarkswiftTextObservationAnchor]) { value.append(contentsOf: nextValue()) }
}
nonisolated struct MarkswiftTextObservationFrames: PreferenceKey {
    static var defaultValue: [MarkswiftObservedTextFrame] { [] }
    static func reduce(value: inout [MarkswiftObservedTextFrame], nextValue: () -> [MarkswiftObservedTextFrame]) { value.append(contentsOf: nextValue()) }
}
extension View {
    @ViewBuilder nonisolated private func markswiftTextDrawing(_ key: String, recordDraws: Bool) -> some View {
        if #available(iOS 18.0, macOS 15.0, tvOS 18.0, watchOS 11.0, *), recordDraws {
            textRenderer(MarkswiftPassiveTextRenderer(view: key))
        } else {
            self
        }
    }
    @ViewBuilder nonisolated func markswiftObserveText(_ key: String, recordDraws: Bool = true) -> some View {
        if #available(iOS 18.0, macOS 15.0, tvOS 18.0, watchOS 11.0, *) {
            markswiftTextDrawing(key, recordDraws: recordDraws)
                .transformAnchorPreference(key: MarkswiftTextObservationAnchors.self, value: .bounds) { values, anchor in
                    values.append(MarkswiftTextObservationAnchor(key: key, bounds: anchor))
                }
        } else {
            self // No observation on older runtimes; absence cannot satisfy native coverage.
        }
    }
}
struct MarkswiftTextObservationReader<Content: View>: View {
    var content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content.overlayPreferenceValue(MarkswiftTextObservationAnchors.self) { anchors in
            GeometryReader { proxy in
                let frames = anchors.map { anchor in
                    let rect = proxy[anchor.bounds]
                    return MarkswiftObservedTextFrame(key: anchor.key, x: Double(rect.minX), y: Double(rect.minY), w: Double(rect.width), h: Double(rect.height))
                }
                Color.clear.preference(key: MarkswiftTextObservationFrames.self, value: frames)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .onPreferenceChange(MarkswiftTextObservationFrames.self) { frames in MarkswiftTextObservationCollector.shared.appendFrames(frames) }
    }
}
`;
