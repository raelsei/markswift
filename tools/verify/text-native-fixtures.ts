/** Uniform font samples exercise native wrapping and two distinct bold optical sizes. */
export const textNativeFixtures = [
  { id: "h1", tag: "h1", value: "Quotes and documentation blocks", font: "700 23px/28px" },
  { id: "h2", tag: "h2", value: "The shape of a sentence", font: "700 18px/24px" },
  { id: "greedy", tag: "p", value: "Clear structure makes complex work easier to inspect and adapt when the available width changes.", font: "14px/20px" },
] as const;

export interface TextNativeReference {
  id: string; viewport: number; width: number; height: number; first: number;
  words: Array<{ text: string; x: number; y: number; w: number; h: number }>;
}

export function textNativeTests(directory: string, references: TextNativeReference[]): string {
  const actions = references.flatMap(ref => (["app", "fidelity"] as const).flatMap(mode => [2, 3].map(scale => {
    const view = mode === "app" ? `App_${ref.id}()` : `Fidelity_${ref.id}_${ref.viewport}()`;
    return `try render(AnyView(${view}), id: "${ref.id}", mode: "${mode}", width: ${ref.width}, height: ${ref.height}, first: ${ref.first}, scale: ${scale})`;
  })));
  return `import XCTest
import SwiftUI
import UIKit
@testable import Generated
private let directory = ${JSON.stringify(directory)}
private func recordTextProof(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let text = String(data: data, encoding: .utf8) { print("LINE_BOX_PROOF " + text) }
}
private struct ObserveText: Layout {
    var id: String; var mode: String; var width: CGFloat; var height: CGFloat; var first: CGFloat; var scale: Double
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let d = subviews[0].dimensions(in: ProposedViewSize(width: width, height: nil))
        recordTextProof(["id": id, "mode": mode, "width": width, "scale": scale, "height": d.height, "firstBaseline": d[.firstTextBaseline], "lastBaseline": d[.lastTextBaseline]])
        XCTAssertEqual(d.height, height, accuracy: 0.001, "Actual native reflow height")
        XCTAssertEqual(d[.firstTextBaseline], first, accuracy: 0.001, "Actual native first baseline")
        return CGSize(width: width, height: d.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: width, height: nil))
    }
}
final class TextNativeTests: XCTestCase {
    @MainActor func testActualWordPlacementAndReflow() throws {
        ${actions.join("\n        ")}
    }
    @MainActor func testWrongNativeAdvanceChangesMeasuredGeometry() throws {
        AdvanceProofState.factor = 1.5
        defer { AdvanceProofState.factor = 1 }
        // Chrome's reference heading has one24px line; the actual wrong allocation has two.
        try render(AnyView(App_h2()), id: "fault-h2", mode: "app", width: 288, height: 48, first: 18, scale: 2)
    }
    @MainActor private func render(_ content: AnyView, id: String, mode: String, width: CGFloat, height: CGFloat, first: CGFloat, scale: Double) throws {
        AdvanceProofState.id = id; AdvanceProofState.width = width; AdvanceProofState.scale = scale
        let view = ObserveText(id: id, mode: mode, width: width, height: height, first: first, scale: scale) { content }
            .padding(16).frame(width: width + 32, height: height + 32, alignment: .topLeading).background(.white).environment(\\.displayScale, scale)
        let renderer = ImageRenderer(content: view); renderer.scale = 2
        renderer.proposedSize = ProposedViewSize(width: width + 32, height: height + 32)
        let image = try XCTUnwrap(renderer.uiImage)
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: directory + "/\\(id)-\\(mode)-\\(Int(width + 32))-scale\\(Int(scale)).png"))
    }
}
`;
}

/** Passive final word frames, rather than browser-derived or planned placement coordinates. */
export const textNativeState = `import SwiftUI
nonisolated enum AdvanceProofState {
    nonisolated(unsafe) static var id = ""
    nonisolated(unsafe) static var width: CGFloat = 0
    nonisolated(unsafe) static var scale: Double = 2
    nonisolated(unsafe) static var factor: CGFloat = 1
    static func record(index: Int, text: String, rect: CGRect, advance: CGFloat) {
        let value: [String: Any] = ["id": id, "width": width, "scale": scale, "factor": factor, "index": index, "text": text, "x": rect.minX, "y": rect.minY, "w": rect.width, "h": rect.height, "advance": advance]
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let text = String(data: data, encoding: .utf8) { print("WORD_FRAME " + text) }
    }
}
`;

export function instrumentTextWords(runtime: string): string {
  const key = ".layoutValue(key: MarkswiftFlowItemAdvance.self, value: MarkswiftTextAdvance.width(word, font: nativeFont))";
  if (!runtime.includes(key)) throw new Error("Native word instrumentation target changed");
  return runtime.replace(key, `${key.slice(0, -1)} * AdvanceProofState.factor)
                        .background {
                            GeometryReader { proxy in
                                let rect = proxy.frame(in: .named("WordContent"))
                                let _ = AdvanceProofState.record(index: index, text: word, rect: rect, advance: MarkswiftTextAdvance.width(word, font: nativeFont))
                                Color.clear
                            }
                        }`);
}
