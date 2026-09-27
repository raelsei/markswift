import type { SemNode } from "../../src/model/semantic.ts";
import type { EmitContext, EmitMode } from "../../src/swift/context.ts";
import { frameModifier } from "../../src/swift/frames.ts";

/** Independent frame inputs; the emitted modifiers come from the production emitter. */
export function frameNode(patch: Record<string, unknown> = {}): SemNode {
  return { id: "frame-probe", kind: "box", frame: { x: 0, y: 0, w: 128, h: 424 },
    width: { kind: "fill" }, height: { kind: "fill" }, padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [], ...patch } as SemNode;
}
export function emittedFrame(node: SemNode, mode: EmitMode): string[] {
  const context = { mode, screen: { size: { w: 128, h: 380 } } } as EmitContext;
  return frameModifier(node, context);
}
export interface FrameProbeCase {
  id: string; mode: EmitMode; node: SemNode; proposalHeight: number | null; expected: number; naturalHeight?: number;
}
export function frameProbeCases(): FrameProbeCase[] {
  const text = frameNode({ kind: "text", height: { kind: "hug" }, runs: [], lines: 1, align: "left" });
  const stack = { kind: "stack", axis: "v", align: "start", distribution: "start", spacing: 0, leadInset: 0, children: [text] };
  return [
    { id: "app-fill", mode: "app", node: frameNode(), proposalHeight: 380, expected: 380 },
    { id: "fidelity-fill", mode: "fidelity", node: frameNode(), proposalHeight: 380, expected: 380 },
    { id: "fill-unspecified", mode: "app", node: frameNode(), proposalHeight: null, expected: 424 },
    { id: "fill-spare-space", mode: "app", node: frameNode(), proposalHeight: 380, expected: 380, naturalHeight: 120 },
    { id: "fill-explicit-zero", mode: "app", node: frameNode({ minHeight: 0 }), proposalHeight: 380, expected: 380 },
    { id: "fill-explicit-minimum", mode: "app", node: frameNode({ minHeight: 500 }), proposalHeight: 380, expected: 500 },
    { id: "fill-tight-cap", mode: "app", node: frameNode({ maxHeight: 300 }), proposalHeight: 380, expected: 300 },
    { id: "fixed-height", mode: "app", node: frameNode({ height: { kind: "fixed", px: 180 } }), proposalHeight: 380, expected: 180 },
    { id: "hug-height", mode: "app", node: frameNode({ height: { kind: "hug" } }), proposalHeight: 380, expected: 424 },
    { id: "text-floor", mode: "app", node: frameNode({ ...stack, height: { kind: "fixed", px: 300 } }), proposalHeight: 380, expected: 380 },
    { id: "allocated-hug", mode: "app", node: frameNode({ ...stack, axis: "h", align: "stretch", height: { kind: "hug" }, allocation: { tracks: [] }, minHeight: 500, maxHeight: 550 }), proposalHeight: 380, expected: 424 },
  ];
}
export function productionFrameProbeSwift(cases: FrameProbeCase[], reportPath: string, overflowPath: string): string {
  return `import SwiftUI
import Foundation
nonisolated struct FrameMeasurement: Codable {
    var id: String
    var phase: String
    var proposalHeight: Double?
    var actualHeight: Double
}
nonisolated final class FrameMeasurementCollector: @unchecked Sendable {
    static let shared = FrameMeasurementCollector()
    private let lock = NSLock()
    private var records: [FrameMeasurement] = []
    func append(_ record: FrameMeasurement) { lock.lock(); defer { lock.unlock() }; records.append(record) }
    func encoded() throws -> Data { lock.lock(); defer { lock.unlock() }; return try JSONEncoder().encode(records) }
}
nonisolated struct FrameMeasurementLayout: Layout {
    var id: String
    func measure(_ proposal: ProposedViewSize, _ views: Subviews, _ phase: String) -> CGSize {
        let actual = views[0].dimensions(in: proposal)
        FrameMeasurementCollector.shared.append(FrameMeasurement(id: id, phase: phase, proposalHeight: proposal.height.map(Double.init), actualHeight: Double(actual.height)))
        return CGSize(width: actual.width, height: actual.height)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { measure(proposal, subviews, "sizeThatFits") }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = measure(proposal, subviews, "placeSubviews")
        subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: proposal)
    }
}
${cases.map((c, i) => `struct FrameProbe${i}: View {
    var body: some View {
        Rectangle().foregroundStyle(Color.black).frame(width: 96, height: ${(c.naturalHeight ?? 424) - 32}).padding(16)
        ${emittedFrame(c.node, c.mode).join("\n        ")}
    }
}`).join("\n")}
${cases.map((c, i) => `let renderer${i} = ImageRenderer(content: FrameMeasurementLayout(id: ${JSON.stringify(c.id)}) { FrameProbe${i}() })
renderer${i}.proposedSize = ProposedViewSize(width: 128, height: ${c.proposalHeight ?? "nil"})
guard renderer${i}.cgImage != nil else { fatalError("actual public frame renderer unavailable") }`).join("\n")}
let overflow = ImageRenderer(content: ZStack(alignment: .topLeading) {
    Color.white.frame(width: 128, height: 500)
    FrameProbe0().frame(width: 128, height: 380, alignment: .topLeading)
})
guard let overflowImage = overflow.cgImage else { fatalError("actual overflow renderer unavailable") }
let bitmap = NSBitmapImageRep(cgImage: overflowImage)
guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("actual overflow PNG unavailable") }
try png.write(to: URL(fileURLWithPath: ${JSON.stringify(overflowPath)}))
try FrameMeasurementCollector.shared.encoded().write(to: URL(fileURLWithPath: ${JSON.stringify(reportPath)}))
`;
}
