import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CONTROL_RUNTIME } from "../../../src/swift/control-runtime.ts";
import { INLINE_BASELINE_RUNTIME } from "../../../src/swift/inline-baseline-runtime.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { Screen, StackNode, TextNode, ControlNode } from "../../../src/model/semantic.ts";

test("fidelity preserves admitted parent inline extent without changing padding, children or app emission", () => {
  const common = { padding: [0, 0, 0, 0] as [number, number, number, number], style: { fills: [], shadows: [] },
    confidence: "mapped" as const, notes: [], overlays: [] };
  const control: ControlNode = { ...common, id: "#control", kind: "control", control: "toggle", checked: true, markColorScheme: "light", content: [],
    frame: { x: 35, y: 24, w: 13, h: 13 }, width: { kind: "fixed", px: 13 }, height: { kind: "fixed", px: 13 } };
  const text: TextNode = { ...common, id: "#caption", kind: "text", frame: { x: 49, y: 23, w: 140, h: 17 }, width: { kind: "hug" }, height: { kind: "hug" },
    align: "leading", lines: 1, runs: [{ text: "Bordered direct label", font: { family: { kind: "system", design: "default" }, size: 14, weight: 400, lineHeight: 20 }, color: { r: 0, g: 0, b: 0, a: 1 } }],
    lineBox: { firstBaseline: 14, baselines: [14], baselineToBottom: 3, baselineStep: 20 } };
  const row: StackNode = { ...common, id: "#row", kind: "stack", frame: { x: 16, y: 16, w: 358, h: 39 }, width: { kind: "fill" }, height: { kind: "hug" },
    padding: [6, 9, 12, 15], axis: "h", children: [control, text], align: "start", distribution: "start", spacing: 1, leadInset: 4,
    inlineBaseline: { strutAscent: 15, strutDescent: 5, sourceInsets: [6, 9, 12, 15], items: [
      { kind: "widget", baseline: 13, height: 13, top: 2, bottom: 6 }, { kind: "text", baseline: 14, height: 17, top: 0, bottom: 0 }] } };
  const screen: Screen = { version: 1, name: "Inline", source: "inline.html", theme: "light", size: { w: 390, h: 80 }, canvas: { r: 1, g: 1, b: 1, a: 1 }, root: row };
  const original = structuredClone(screen), app = emitSwift(screen, "Inline", { mode: "app" });
  const fidelity = emitSwift(screen, "Inline", { mode: "fidelity", geometryInstrumentation: true, textInstrumentation: true });
  expect(fidelity.view).toContain(".frame(height: 39.0, alignment: .topLeading)");
  expect(fidelity.view).toContain("bottom: 12.0");
  expect(fidelity.view).toContain(".padding(.top, 2.0)");
  expect(fidelity.view).toContain(".padding(.top, 1.0)");
  expect(fidelity.geometry!.nodes.find(node => node.sourceId === "#row")?.instrumented).toBe(true);
  expect(fidelity.text!.nodes.map(node => node.semanticId)).toEqual(["#caption"]);
  expect(fidelity.text!.emissions.map(emission => emission.value)).toEqual(["Bordered direct label"]);
  expect(screen).toEqual(original);
  expect(emitSwift(screen, "Inline", { mode: "app" }).view).toBe(app.view);
  delete row.inlineBaseline;
  expect(emitSwift(screen, "Inline", { mode: "fidelity" }).view).not.toContain(".frame(height: 39.0, alignment: .topLeading)");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("real native widget guides preserve margins/strut and report newly multiline or wrong-guide fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-inline-guides-"));
  try {
    const first = CONTROL_RUNTIME.indexOf("@MainActor struct MarkswiftMarkButtonStyle"), end = CONTROL_RUNTIME.indexOf("/// The bar a browser paints");
    await Bun.write(join(directory, "Runtime.swift"), "import SwiftUI\nimport Foundation\n" + CONTROL_RUNTIME.slice(first, end) + INLINE_BASELINE_RUNTIME);
    await Bun.write(join(directory, "main.swift"), `import SwiftUI
import AppKit
import Foundation
@MainActor func render(_ content: some View, width: CGFloat) -> CGImage {
    let renderer = ImageRenderer(content: content.frame(width: width, alignment: .topLeading).background(Color.white))
    renderer.scale = 2
    return renderer.cgImage!
}
@MainActor func sample(_ size: CGFloat, _ font: CGFloat, _ guide: CGFloat, _ textHeight: CGFloat, _ strut: CGFloat, _ tail: CGFloat, _ top: CGFloat, _ bottom: CGFloat, _ mark: MarkswiftMarkToggleStyle.Mark) -> [String: Any] {
    let collector = MarkswiftInlineBaselineCollector()
    let id = "size-\\(size)-font-\\(font)-margin-\\(top)-\\(bottom)-\\(mark)"
    collector.startSession(view: id)
    let row = MarkswiftInlineBaselineRow(id: id, strutAscent: strut, strutDescent: tail,
        items: [.init(widget: true, baseline: size, height: size, top: top, bottom: bottom), .init(widget: false, baseline: guide, height: textHeight, top: 0, bottom: 0)], spacing: [4], leading: 0) {
        Toggle(isOn: .constant(true)) { EmptyView() }.toggleStyle(MarkswiftMarkToggleStyle(mark: mark, tint: .blue, palette: .light)).frame(width: size, height: size)
        Text(verbatim: "Baseline control").font(.system(size: font)).fixedSize(horizontal: false, vertical: true)
    }
    let plain = render(row, width: 280), observed = render(row.markswiftObserveInlineBaselines(collector), width: 280)
    precondition((plain.dataProvider!.data! as Data) == (observed.dataProvider!.data! as Data), "Observer changes actual paint")
    let records = collector.snapshot()
    let placed = records.filter { $0.phase == "placeSubviews" }
    precondition(!placed.isEmpty && records.count > placed.count, "Actual native Layout phases were lost")
    precondition(placed.allSatisfy { $0.available && $0.usedSourceStrut && $0.mountedView == id && $0.session == 1 })
    let value = placed.first!
    precondition(value.available && value.usedSourceStrut && value.reason == nil)
    precondition(value.children[0].firstBaseline == Double(size) && value.children[0].lastBaseline == Double(size), "Actual native widget guide differs")
    precondition(abs(value.children[1].firstBaseline! - Double(guide)) <= 0.5, "Actual native Text guide outside recorded rounding contract")
    let observedTextGuide = CGFloat(value.children[1].firstBaseline!), observedTextHeight = CGFloat(value.children[1].height)
    let baseline = max(strut, size + top, observedTextGuide), descent = max(tail, bottom, observedTextHeight - observedTextGuide)
    precondition(observed.height == Int((baseline + descent) * 2), "Strut or asymmetric margins lost")
    return ["id": id, "actualWidgetGuide": value.children[0].firstBaseline!, "actualTextGuide": value.children[1].firstBaseline!, "actualRowPixels": observed.height, "observerRGBAExact": true]
}
var observations: [[String: Any]] = []
for mark in [MarkswiftMarkToggleStyle.Mark.check, .dot] {
    observations.append(sample(13, 14, 14, 17, 15, 5, 3, 3, mark))
    observations.append(sample(13, 14, 14, 17, 15, 5, 2, 6, mark))
    observations.append(sample(16, 18, 17.5, 21.5, 20, 8, 3, 3, mark))
    observations.append(sample(22, 14, 14, 17, 15, 5, 0, 0, mark))
    observations.append(sample(22, 18, 17.5, 21.5, 20, 8, 3, 3, mark))
}
let wrapped = MarkswiftInlineBaselineCollector()
let multiline = MarkswiftInlineBaselineRow(id: "wrap-negative", strutAscent: 99, strutDescent: 99,
    items: [.init(widget: true, baseline: 13, height: 13, top: 3, bottom: 3), .init(widget: false, baseline: 14, height: 17, top: 0, bottom: 0)], spacing: [4], leading: 0) {
    Toggle(isOn: .constant(true)) { EmptyView() }.toggleStyle(MarkswiftMarkToggleStyle(mark: .check, tint: .blue, palette: .light)).frame(width: 13, height: 13)
    Text(verbatim: "Several words genuinely wrap at the offered narrow width").font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
}
wrapped.startSession(view: "narrow-mount")
_ = render(multiline.markswiftObserveInlineBaselines(wrapped), width: 110)
wrapped.startSession(view: "wide-mount")
_ = render(multiline.markswiftObserveInlineBaselines(wrapped), width: 1000)
let wrapRecords = wrapped.snapshot()
let actualWrap = wrapRecords.first { $0.phase == "placeSubviews" && $0.session == 1 }!
precondition(!actualWrap.available && !actualWrap.usedSourceStrut && actualWrap.reason == "native-inline-text-multiline")
precondition(actualWrap.children[1].lastBaseline! > actualWrap.children[1].firstBaseline!)
precondition(wrapRecords.contains { $0.phase == "placeSubviews" && $0.session == 2 && $0.available && $0.mountedView == "wide-mount" }, "Separate actual mount lost")
precondition(wrapRecords.enumerated().allSatisfy { $0.element.sequence == $0.offset + 1 }, "Measurement order lost")
precondition(wrapRecords.filter { !$0.available && $0.session == 1 }.count > 1, "Repeated unavailable measurements were overwritten by the later success")
let report = try JSONSerialization.jsonObject(with: wrapped.encoded()) as! [String: Any]
precondition((report["observations"] as! [[String: Any]]).count == wrapRecords.count)
precondition((report["finalDrawSelection"] as! String).hasPrefix("unavailable:"))
let mismatch = MarkswiftInlineBaselineCollector()
let wrongGuide = MarkswiftInlineBaselineRow(id: "guide-negative", strutAscent: 99, strutDescent: 99,
    items: [.init(widget: true, baseline: 12, height: 13, top: 3, bottom: 3), .init(widget: false, baseline: 14, height: 17, top: 0, bottom: 0)], spacing: [4], leading: 0) {
    Toggle(isOn: .constant(true)) { EmptyView() }.toggleStyle(MarkswiftMarkToggleStyle(mark: .dot, tint: .blue, palette: .light)).frame(width: 13, height: 13)
    Text(verbatim: "Baseline control").font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
}
let failedImage = render(wrongGuide.markswiftObserveInlineBaselines(mismatch), width: 280)
let actualMismatch = mismatch.snapshot().first { $0.phase == "placeSubviews" }!
precondition(!actualMismatch.available && !actualMismatch.usedSourceStrut && actualMismatch.reason == "native-baseline-guide-mismatch")
precondition(failedImage.height < 99 * 2, "Mismatch silently reused old source strut")
print(String(data: try JSONSerialization.data(withJSONObject: ["actualGuides": observations, "realMultilineReported": true, "wrongGuideReported": true, "allMeasurementsRetained": true, "duplicateRowIDSeparateMountsRetained": true, "finalDrawSelection": report["finalDrawSelection"]!, "platform": "actual macOS SwiftUI; native font guides are platform facts, not iOS glyph equality"], options: [.sortedKeys]), encoding: .utf8)!)
`);
    const compile = await Bun.$`xcrun swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors ${join(directory, "Runtime.swift")} ${join(directory, "main.swift")} -o ${join(directory, "proof")}`.nothrow().quiet();
    expect(compile.stderr.toString()).toBe(""); expect(compile.exitCode).toBe(0);
    const executed = await Bun.$`${join(directory, "proof")}`.nothrow().quiet();
    expect(executed.stderr.toString()).toBe(""); expect(executed.exitCode).toBe(0);
    const proof = JSON.parse(executed.stdout.toString()); expect(proof.actualGuides).toHaveLength(10);
    expect(proof.realMultilineReported).toBe(true); expect(proof.wrongGuideReported).toBe(true);
    expect(proof.allMeasurementsRetained).toBe(true); expect(proof.duplicateRowIDSeparateMountsRetained).toBe(true);
    expect(proof.finalDrawSelection).toContain("not certified final draws");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
