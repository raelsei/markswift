import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { FLOW_RUNTIME } from "../../src/swift/flow-runtime.ts";
import { GREEDY_TEXT_RUNTIME } from "../../src/swift/greedy-text-runtime.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { frameModifier } from "../../src/swift/frames.ts";
import type { EmitContext } from "../../src/swift/context.ts";
import { textLineBoxFixture } from "../helpers/text-line-box-fixture.ts";

const nativeBrowserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" && process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const profiles = [
  { id: "short", text: "Engineering", display: "inline-block", css: "", fit: true },
  { id: "wrapped", text: "Measure the available width before translating complex content into a reusable interface", display: "inline-block", css: "", fit: true },
  { id: "unbreakable", text: "SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious", display: "inline-block", css: "", fit: true },
  { id: "capped", text: "Measure the available width before translating complex content", display: "inline-block", css: "max-width:130px", max: 130, fit: true },
  { id: "overflow", text: "Supercalifragilisticexpialidocious", display: "inline-block", css: "max-width:80px", max: 80, fit: true },
  { id: "minimum", text: "Small", display: "inline-block", css: "min-width:180px", min: 180, fit: true },
  { id: "paragraph", text: "Engineering", display: "block", css: "", fit: false },
];

nativeBrowserTest("real SwiftUI greedy sizing matches independent Chrome hug, cap, overflow and fill widths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-greedy-hug-"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const probes: string[] = [];
  try {
    const page = await browser.newPage();
    for (const width of [320, 390, 500]) {
      await page.setViewportSize({ width, height: 600 });
      for (const profile of profiles) {
        await page.setContent(`<style>body{margin:0}main{padding:0 16px}#sample{display:${profile.display};font:14px/20px system-ui;${profile.css}}</style><main><span id="sample">${profile.text}</span></main>`);
        const reference = await page.evaluate(() => {
          const element = document.querySelector("#sample")!, text = element.firstChild as Text;
          const words = [...text.data.matchAll(/\S+/g)].map(match => {
            const range = document.createRange(); range.setStart(text, match.index!); range.setEnd(text, match.index! + match[0].length);
            const rect = range.getBoundingClientRect(); return { y: rect.y, w: rect.width };
          });
          return { width: element.getBoundingClientRect().width, lines: new Set(words.map(word => word.y)).size, largestWord: Math.max(...words.map(word => word.w)) };
        });
        if (profile.id === "overflow") expect(reference.largestWord).toBeGreaterThan(reference.width);
        const label = `${profile.id}-${width}`;
        const limits = `, fitContent: ${profile.fit}${"min" in profile ? `, minWidth: ${profile.min}` : ""}${"max" in profile ? `, maxWidth: ${profile.max}` : ""}`;
        probes.push(`let renderer${probes.length} = ImageRenderer(content: HugProbe(label: "${label}", proposed: ${width - 32}, expected: ${reference.width}, rows: ${reference.lines}) {
    MarkswiftGreedyText(${JSON.stringify(profile.text)}, font: .system(size: 14), color: .black, fontSize: 14, lineGap: 0, baselineStep: 20, nativeWeight: NSFont.Weight.regular.rawValue${limits})
})
_ = renderer${probes.length}.cgImage`);
      }
    }
    // AppKit supplies the equivalent native font only for this no-Simulator execution.
    // The complete original UIKit runtime is typechecked below and used by native visual proof.
    await Bun.write(join(directory, "proof.swift"), `import SwiftUI\nimport CoreText\n${FLOW_RUNTIME}\n${GREEDY_TEXT_RUNTIME.replaceAll("UIFont", "NSFont")}\n
struct HugProbe: Layout {
    let label: String
    let proposed: CGFloat
    let expected: CGFloat
    let rows: Int
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let dimensions = subviews[0].dimensions(in: ProposedViewSize(width: proposed, height: nil))
        precondition(abs(dimensions.width - expected) < 0.2, "Width mismatch: \\(label) \\(dimensions.width) expected \\(expected)")
        let step = dimensions[.lastTextBaseline] - dimensions[.firstTextBaseline]
        precondition(abs(step - CGFloat(rows - 1) * 20) < 0.01, "Rows mismatch: \\(label) \\(step)")
        print("passed", label)
        return CGSize(width: proposed, height: dimensions.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
}
${probes.join("\n")}
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, code] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(code, error).toBe(0);
    expect(error).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, runError, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, runError).toBe(0);
    expect(new Set(output.split("\n").filter(line => line.startsWith("passed "))).size).toBe(probes.length);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
}, 60000);

nativeBrowserTest("captured hugging text with native width caps typechecks as complete iOS bundles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-hug-sdk-"));
  try {
    const html = '<main id="root"><span class="badge">Engineering</span><span class="capped">Small</span><span class="capped">Measure the available width before translating complex content</span><span class="overflow">Supercalifragilisticexpialidocious</span><p>Ordinary paragraphs fill their containing block.</p></main>';
    const css = 'body{margin:0}main{box-sizing:border-box;width:100%;padding:16px;font:14px/20px system-ui}.badge,.capped,.overflow{display:inline-block}.badge{padding:3px 7px}.capped{max-width:130px}.overflow{max-width:80px}p{margin:0}';
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml(html, { root: "#root", css, name: "HugSDK", mode, viewport: { width: 390, height: 300 } });
      if (mode === "app") {
        expect(result.code).toContain("fitContent: true");
        expect(result.code).toContain("maxWidth: 130.0");
      }
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const checked = await typecheck(output);
      expect(checked.ok, checked.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

nativeTest("emitted fill frames accept finite proposals and retain ideal sizes and authored floors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-fill-proposal-"));
  try {
    const screen = inferScreen(textLineBoxFixture(), "FillProposal");
    screen.root.width = { kind: "fill" }; screen.root.height = { kind: "hug" };
    const context = { mode: "fidelity", screen } as EmitContext;
    const fill = frameModifier(screen.root, context).join("\n");
    screen.root.minWidth = 72;
    const floor = frameModifier(screen.root, context).join("\n");
    await Bun.write(join(directory, "proof.swift"), `import SwiftUI
struct Intrinsic: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { CGSize(width: 91.5, height: 20) }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
}
struct FillProbe: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let small = subviews[0].sizeThatFits(ProposedViewSize(width: 68.66, height: 20))
        let ideal = subviews[0].sizeThatFits(.unspecified)
        let floor = subviews[1].sizeThatFits(ProposedViewSize(width: 68.66, height: 20))
        precondition(abs(small.width - 68.66) < 0.001)
        precondition(abs(ideal.width - 91.5) < 0.001)
        precondition(abs(floor.width - 72) < 0.001)
        print("fill proposal, ideal and authored floor passed")
        return CGSize(width: 160, height: 20)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
}
let renderer = ImageRenderer(content: FillProbe { Intrinsic {} ${fill}\nIntrinsic {} ${floor} })
_ = renderer.cgImage
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, code] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(code, error).toBe(0);
    expect(error).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, runError, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, runError).toBe(0);
    expect(output).toContain("fill proposal, ideal and authored floor passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
