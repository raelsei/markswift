/** Optional verification only; production output contains none of these helpers. */
export const GEOMETRY_RUNTIME = `import SwiftUI
import Foundation

nonisolated struct MarkswiftGeometryFrame: Codable, Equatable, Sendable {
    var key: String
    var role: String
    var x: Double
    var y: Double
    var w: Double
    var h: Double
}

nonisolated struct MarkswiftGeometryAnchor {
    var key: String
    var role: String
    var bounds: Anchor<CGRect>
}

nonisolated struct MarkswiftGeometryAnchors: PreferenceKey {
    static var defaultValue: [MarkswiftGeometryAnchor] { [] }
    static func reduce(value: inout [MarkswiftGeometryAnchor], nextValue: () -> [MarkswiftGeometryAnchor]) {
        value.append(contentsOf: nextValue())
    }
}

nonisolated struct MarkswiftGeometryFrames: PreferenceKey {
    static var defaultValue: [MarkswiftGeometryFrame] { [] }
    static func reduce(value: inout [MarkswiftGeometryFrame], nextValue: () -> [MarkswiftGeometryFrame]) {
        value.append(contentsOf: nextValue())
    }
}

/// Observation callbacks do not update any SwiftUI state or participate in layout.
nonisolated final class MarkswiftGeometryCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var frames: [MarkswiftGeometryFrame] = []
    private var revision: Int = 0

    func replace(_ input: [MarkswiftGeometryFrame]) {
        let next = input.sorted { $0.key < $1.key }
        lock.lock(); defer { lock.unlock() }
        if next != frames { frames = next; revision += 1 }
    }
    func snapshot() -> [MarkswiftGeometryFrame] {
        lock.lock(); defer { lock.unlock() }
        return frames
    }
    func updateCount() -> Int {
        lock.lock(); defer { lock.unlock() }
        return revision
    }
    func encoded(backend: String, width: Double, height: Double) throws -> Data {
        struct Payload: Encodable {
            var version = 1
            var coordinateSpace = "capture-viewport"
            var frameKind = "painted-border-aabb"
            var backend: String
            var width: Double
            var height: Double
            var frames: [MarkswiftGeometryFrame]
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(Payload(backend: backend, width: width, height: height, frames: snapshot()))
    }
}

extension View {
    nonisolated func markswiftObserveGeometry(_ key: String, role: String) -> some View {
        transformAnchorPreference(key: MarkswiftGeometryAnchors.self, value: .bounds) { values, anchor in
            values.append(MarkswiftGeometryAnchor(key: key, role: role, bounds: anchor))
        }
    }
}

struct MarkswiftGeometryReader<Content: View>: View {
    var content: Content
    var collector: MarkswiftGeometryCollector
    var body: some View {
        content.overlayPreferenceValue(MarkswiftGeometryAnchors.self) { anchors in
            GeometryReader { proxy in
                let frames = anchors.map { anchor in
                    let rect = proxy[anchor.bounds]
                    return MarkswiftGeometryFrame(key: anchor.key, role: anchor.role,
                        x: Double(rect.minX), y: Double(rect.minY), w: Double(rect.width), h: Double(rect.height))
                }
                Color.clear
                    .preference(key: MarkswiftGeometryFrames.self, value: frames)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .onPreferenceChange(MarkswiftGeometryFrames.self) { frames in collector.replace(frames) }
    }
}
`;
