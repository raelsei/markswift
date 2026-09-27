import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayouts } from "../../src/compiler/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { INLINE_CONTENT_FLOW_RUNTIME } from "../../src/swift/inline-content-flow-runtime.ts";
import { TEXT_ADVANCE_RUNTIME } from "../../src/swift/text-advance-runtime.ts";
import { TEXT_LINE_BOX_RUNTIME } from "../../src/swift/text-line-box-runtime.ts";
import { inlineContentFlowFixture } from "../helpers/inline-content-flow-fixture.ts";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type StackNode } from "../../src/model/semantic.ts";
import { intrinsicSource } from "../../src/analysis/intrinsic-min-content-source.ts";

const sdkTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
browserTest("a directly captured multiline caption keeps first-line widget ownership in fidelity", async () => {
  const html = '<!doctype html><main id="proof"><fieldset><legend>Export preferences</legend><label id="row"><input type="checkbox"> Include diagnostics</label></fieldset></main>';
  const css = 'html,body{margin:0}main{padding:16px;box-sizing:border-box;font:14px/20px system-ui}fieldset{margin:0;padding:12px;border:1px solid black;min-width:min-content}legend{padding:0 5px}label{display:block;padding:5px 0;margin-bottom:6px}input{width:13px;height:13px}';
  for (const width of [128, 390]) {
    const result = await convertHtml(html, { css, name: "CapturedInline", root: "#proof", mode: "fidelity", viewport: { width, height: 380 } });
    let row: StackNode | undefined;
    walk(inferScreen(result.layout, "CapturedInline").root, node => { if (node.kind === "stack" && node.id === "#row") row = node; });
    expect(row?.inlineContentFlow).toBeDefined();
    const widget = row!.children[row!.inlineContentFlow!.widget]!;
    const joined = intrinsicSource(row!);
    expect(widget.kind).toBe("control");
    expect(intrinsicSource(widget)?.source).toBe(joined!.source.children[0]);
    expect(result.code).toContain("MarkswiftInlineContentRow");
  }
}, 60000);
browserTest("live captured containment defaults admit only the ordinary source auto-height contract", async () => {
  const html = `<!doctype html><main id="proof"><fieldset id="field"><legend>Export preferences</legend><label id="row"><input type="checkbox"> Include diagnostics</label></fieldset></main>`;
  const css = `html,body{margin:0}main{padding:16px;box-sizing:border-box;font:14px/20px system-ui}fieldset{margin:0;border:1px solid black;padding:12px;min-width:min-content}legend{padding:0 5px}label{display:block;padding:5px 0;margin-bottom:6px}input{width:13px;height:13px}`;
  for (const [variant, extra] of [["ordinary", ""], ["parent-size", "fieldset{contain:size}"], ["row-size", "label{contain:size}"], ["content-auto", "fieldset{content-visibility:auto}"], ["content-hidden", "fieldset{content-visibility:hidden}"], ["side-margins", "label{margin-left:10px;margin-right:10px}"]] as const) {
    const result = await convertHtml(html, { name: "InlineCaptured", css: css + extra, root: "#proof", viewport: { width: 390, height: 380 } });
    const found = new Map<string, StackNode>();
    walk(inferScreen(result.layout, "InlineCaptured").root, node => { if (node.kind === "stack") found.set(node.id, node); });
    if (variant === "ordinary") {
      expect(found.get("#row")?.inlineContentFlow).toBeDefined(); expect(found.get("#field")?.contentAutoHeight).toBeDefined();
    } else {
      expect(found.get("#row")?.inlineContentFlow).toBeUndefined(); expect(found.get("#field")?.contentAutoHeight).toBeUndefined();
      if (variant === "side-margins") expect(found.get("#row")?.maxWidth).toBe(312);
    }
    const field = result.layout.root.children[0]!;
    expect(field.styles.contain).toBe(variant === "parent-size" ? "size" : "none");
    expect(field.styles["content-visibility"]).toBe(variant === "content-hidden" ? "hidden" : "visible");
    expect(field.sourceContentVisibility).toBe(variant === "content-auto" ? "auto" : variant === "content-hidden" ? "hidden" : "visible");
  }
}, 60000);
sdkTest("full app/fidelity plain and observed inline continuation bundles compile in strict Swift6", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-inline-flow-sdk-"));
  try {
    const inputs = [false, true].flatMap(observed => (["app", "fidelity"] as const).map(mode => ({
      layout: inlineContentFlowFixture(), name: `InlineSDK${observed ? "Observed" : "Plain"}${mode}`, mode,
      geometryInstrumentation: true, textInstrumentation: observed,
    })));
    const output = compileLayouts(inputs);
    for (const [name, content] of Object.entries(output.files)) await Bun.write(join(directory, name), content);
    const checked = await typecheck(directory); expect(checked.ok, checked.output).toBe(true); expect(checked.deprecations).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

sdkTest("production Layout uses full continuation width, native spaces, source struts and observable mismatch fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-inline-flow-native-"));
  try {
    const source = `import SwiftUI
import CoreText
${TEXT_ADVANCE_RUNTIME}
${TEXT_LINE_BOX_RUNTIME.replaceAll("UIFont", "NSFont")}
${INLINE_CONTENT_FLOW_RUNTIME}
struct NativeWord: View {
    var word: String
    var body: some View {
        MarkswiftTextLineBox(firstBaseline: 14, baselineToBottom: 3, baselineStep: 20, fontSize: 14, fontWeight: NSFont.Weight.regular.rawValue, lineSpacing: 0) {
            Text(verbatim: word).font(Font(probeNativeFont)).fixedSize(horizontal: true, vertical: true)
        }.layoutValue(key: MarkswiftInlineContentAdvance.self, value: MarkswiftTextAdvance.width(word, font: probeNativeFont))
    }
}
struct NativeRow: View {
    let words: [String]
    let collector: MarkswiftInlineContentCollector
    var mismatchedGuide = false
    var body: some View {
        MarkswiftInlineContentRow(id: "row", strutAscent: 15, strutDescent: 5, wordCount: words.count,
            space: MarkswiftTextAdvance.width(" ", font: probeNativeFont), margins: [3, 3, 3, 4], textBaseline: mismatchedGuide ? 99 : 14, textDescent: 3) {
            Rectangle().frame(width: 13, height: 13).alignmentGuide(.firstTextBaseline) { $0.height }
            ForEach(words, id: \\.self) { word in NativeWord(word: word) }
        }.markswiftObserveInlineContent(collector)
    }
}
let probeNativeFont = NSFont.systemFont(ofSize: 14, weight: .regular)
let space = CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(NSAttributedString(string: " ", attributes: [.font: probeNativeFont])), nil, nil, nil))
let words = ["Include", "preview", "host"]
let collector = MarkswiftInlineContentCollector()
collector.startSession(view: "native-probe")
let renderer = ImageRenderer(content: NativeRow(words: words, collector: collector))
renderer.proposedSize = ProposedViewSize(width: 87.234375, height: nil)
guard let _ = renderer.cgImage else { fatalError("Native renderer unavailable") }
let report = try JSONSerialization.jsonObject(with: collector.encoded()) as! [String: Any]
let observations = report["observations"] as! [[String: Any]]
let placements = observations.filter { $0["phase"] as? String == "placeSubviews" && $0["proposalWidth"] as? Double == 87.234375 }
precondition(observations.contains { $0["proposalWidth"] as? Double == 0 }, "exploratory calls remain recorded")
precondition(!placements.isEmpty)
for observation in placements {
    let items = observation["items"] as! [[String: Any]]
    precondition(items.count == 4)
    precondition(items[0]["line"] as! Int == 0 && items[1]["line"] as! Int == 0)
    precondition(items[2]["line"] as! Int == 1 && items[3]["line"] as! Int == 1, "continuation must use full width")
    precondition(abs((items[1]["x"] as! Double) - 20 - Double(space)) < 0.001)
    precondition(items[2]["x"] as! Double == 0 && items[2]["separatorAdvance"] as! Double == 0)
    precondition(observation["usedSourceStrut"] as! Bool)
}
precondition(renderer.cgImage!.height > 0)
let idealCollector = MarkswiftInlineContentCollector()
idealCollector.startSession(view: "native-ideal-width")
let ideal = ImageRenderer(content: NativeRow(words: words, collector: idealCollector))
precondition(ideal.cgImage != nil)
let idealReport = try JSONSerialization.jsonObject(with: idealCollector.encoded()) as! [String: Any]
let idealMeasurements = (idealReport["observations"] as! [[String: Any]]).filter { $0["phase"] as? String == "sizeThatFits" && $0["proposalWidth"] == nil }
precondition(!idealMeasurements.isEmpty && idealMeasurements.allSatisfy { observation in
    (observation["items"] as! [[String: Any]]).allSatisfy { $0["line"] as? Int == 0 }
}, "an actual unspecified-width measurement must preserve the single natural line")
let overflowCollector = MarkswiftInlineContentCollector()
overflowCollector.startSession(view: "native-unbreakable-overflow")
let overflow = ImageRenderer(content: NativeRow(words: ["UnbreakableCaptionWordThatOverflows"], collector: overflowCollector))
overflow.proposedSize = ProposedViewSize(width: 87.234375, height: nil)
precondition(overflow.cgImage != nil)
let overflowReport = try JSONSerialization.jsonObject(with: overflowCollector.encoded()) as! [String: Any]
let overflowPlacements = (overflowReport["observations"] as! [[String: Any]]).filter { $0["phase"] as? String == "placeSubviews" && $0["proposalWidth"] as? Double == 87.234375 }
precondition(!overflowPlacements.isEmpty && overflowPlacements.allSatisfy { observation in
    let items = observation["items"] as! [[String: Any]]
    return items[1]["line"] as? Int == 1 && items[1]["x"] as? Double == 0
        && items[1]["advance"] as! Double > 87.234375 && items[1]["separatorAdvance"] as? Double == 0
}, "an unbreakable word must overflow its full continuation line without advance clamping")
let fallbackCollector = MarkswiftInlineContentCollector()
fallbackCollector.startSession(view: "mismatched-native-guide")
let fallback = ImageRenderer(content: NativeRow(words: words, collector: fallbackCollector, mismatchedGuide: true))
fallback.proposedSize = ProposedViewSize(width: 87.234375, height: nil)
precondition(fallback.cgImage != nil)
let fallbackReport = try JSONSerialization.jsonObject(with: fallbackCollector.encoded()) as! [String: Any]
let mismatches = fallbackReport["observations"] as! [[String: Any]]
precondition(!mismatches.isEmpty && mismatches.allSatisfy { $0["reason"] as? String == "native-inline-font-box-mismatch" && $0["usedSourceStrut"] as? Bool == false })
print("passed native-continuation", placements.count)
`;
    await Bun.write(join(directory, "proof.swift"), source);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [compileError, status] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(status, compileError).toBe(0); expect(compileError).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, error, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, error + output).toBe(0); expect(output).toContain("passed native-continuation");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
