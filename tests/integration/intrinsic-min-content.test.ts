import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayouts } from "../../src/compiler/index.ts";
import type { EmitContext } from "../../src/swift/context.ts";
import { textExpr } from "../../src/swift/text.ts";
import { modifiers } from "../../src/swift/modifiers.ts";
import { FLOW_RUNTIME } from "../../src/swift/flow-runtime.ts";
import { GREEDY_TEXT_RUNTIME } from "../../src/swift/greedy-text-runtime.ts";
import { TEXT_LINE_BOX_RUNTIME } from "../../src/swift/text-line-box-runtime.ts";
import { INTRINSIC_WIDTH_RUNTIME } from "../../src/swift/intrinsic-width-runtime.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { fieldsetMinContentFixture, intrinsicMinContentFixture, nestedMinContentFixture } from "../helpers/intrinsic-min-content-fixture.ts";

const sdkTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

sdkTest("complete app/fidelity and passive-observer bundles compile with the optional min-content program", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-min-content-sdk-"));
  try {
    const inputs = [intrinsicMinContentFixture, nestedMinContentFixture, fieldsetMinContentFixture].flatMap((fixture, index) =>
      (["app", "fidelity"] as const).map(mode => ({ layout: fixture(), name: `MinimumSDK${index}${mode}`, mode,
        geometryInstrumentation: true, textInstrumentation: true })));
    const output = compileLayouts(inputs);
    expect(output.files["MinimumSDK0app.swift"]).toContain("minWidth: MarkswiftIntrinsicWidth");
    expect(output.files["MinimumSDK2app.swift"]).toContain("MarkswiftIntrinsicWidth.fixed(20.0)");
    for (const index of [0, 1, 2]) expect(output.files[`MinimumSDK${index}fidelity.swift`]).not.toContain("MarkswiftIntrinsicWidth");
    for (const [name, content] of Object.entries(output.files)) await Bun.write(join(directory, name), content);
    const checked = await typecheck(directory); expect(checked.ok, checked.output).toBe(true); expect(checked.deprecations).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

sdkTest("production supplied-font text and dynamic frame preserve floors, live proposals and finite maximum precedence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-min-content-layout-"));
  try {
    const screen = inferScreen(intrinsicMinContentFixture(), "MinimumProbe");
    if (screen.root.kind !== "stack" || screen.root.children[0]!.kind !== "text") throw new Error("Expected text contribution");
    const node = screen.root.children[0]!;
    if (!node.intrinsicMinWidth?.program) throw new Error("Expected min-content program");
    const context: EmitContext = { mode: "app", screen, fontMetrics: {}, nameOf: new Map(), shapes: {},
      control: { decls: [], stateOf: new Map(), actionOf: new Map() }, renderNode() { throw new Error("Unexpected nested node"); } };
    const views = [], probes = [];
    for (const [index, cap] of [undefined, 40, 400].entries()) {
      node.intrinsicMinWidth.authoredMaxWidth = cap;
      const body = [...textExpr(node, context), ...modifiers(node, context)].join("\n").replaceAll("UIFont", "NSFont");
      views.push(`struct MinimumView${index}: View { var body: some View { ${body} } }`);
      for (const available of [96, 128, 288, 358, 468]) {
        const expected = cap === undefined ? `max(floor, ${available})` : `min(max(floor, ${cap}), max(floor, ${available}))`;
        const label = `${index}-${available}`;
        probes.push(`let renderer${probes.length} = ImageRenderer(content: MinimumProposalProbe(label: "${label}", width: ${available}, expected: ${expected}) { MinimumView${index}() })\n_ = renderer${probes.length}.cgImage`);
      }
    }
    const source = `import SwiftUI
import CoreText
${FLOW_RUNTIME}
${GREEDY_TEXT_RUNTIME.replaceAll("UIFont", "NSFont")}
${TEXT_LINE_BOX_RUNTIME.replaceAll("UIFont", "NSFont")}
${INTRINSIC_WIDTH_RUNTIME}
extension Color { nonisolated static func markswift(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> Color { Color(.sRGB, red: r, green: g, blue: b, opacity: a) } }
struct MinimumProposalProbe: Layout {
    let label: String
    let width: CGFloat
    let expected: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let actual = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        precondition(abs(actual.width - expected) < 0.001, "width \\(label): \\(actual.width), expected \\(expected)")
        precondition(actual.height > 0)
        print("passed", label)
        return actual
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
}
${views.join("\n")}
// Independent native font measurement, rather than converter coordinates, defines the floor.
let font = NSFont.systemFont(ofSize: 14, weight: .regular)
let attributed = NSAttributedString(string: "Supercalifragilisticexpialidocious", attributes: [.font: font])
let floor = CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(attributed), nil, nil, nil)) + 26
${probes.join("\n")}
`;
    await Bun.write(join(directory, "proof.swift"), source);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [compileError, status] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(status, compileError).toBe(0); expect(compileError).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, error, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, error).toBe(0);
    expect(new Set(output.split("\n").filter(line => line.startsWith("passed "))).size).toBe(15);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
