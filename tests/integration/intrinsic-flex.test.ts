import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { SemNode, StackNode } from "../../src/model/semantic.ts";
import type { EmitContext } from "../../src/swift/context.ts";
import { intrinsicFlexExpr } from "../../src/swift/intrinsic-flex.ts";
import { textExpr } from "../../src/swift/text.ts";
import { modifiers } from "../../src/swift/modifiers.ts";
import { controlExpr } from "../../src/swift/controls.ts";
import { ALLOCATION_CORE } from "../../src/swift/allocation-runtime.ts";
import { INTRINSIC_FLEX_RUNTIME } from "../../src/swift/intrinsic-flex-runtime.ts";
import { FLOW_RUNTIME } from "../../src/swift/flow-runtime.ts";
import { GREEDY_TEXT_RUNTIME } from "../../src/swift/greedy-text-runtime.ts";
import { TEXT_LINE_BOX_RUNTIME } from "../../src/swift/text-line-box-runtime.ts";
import { intrinsicFlexControl, intrinsicFlexControls } from "../helpers/intrinsic-flex-controls.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { compileLayouts } from "../../src/compiler/index.ts";

const nativeBrowserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" && process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

function flex(node: SemNode): StackNode {
  if (node.kind === "stack" && node.id === "#flex") return node;
  for (const child of "children" in node ? node.children : []) {
    try { return flex(child); } catch { /* search another branch */ }
  }
  throw new Error("Missing flex control");
}

nativeBrowserTest("one emitted app layout sizes seven intrinsic flex structures at three live widths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-intrinsic-flex-"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const views: string[] = [], probes: string[] = [];
  try {
    const page = await browser.newPage();
    for (const [index, profile] of intrinsicFlexControls.entries()) {
      const { html, css } = intrinsicFlexControl(profile);
      const captured = await convertHtml(html, { root: "#corpus", css, name: `IntrinsicFlex${index}`, mode: "app", viewport: { width: 390, height: 420 } });
      const screen = inferScreen(captured.layout, `IntrinsicFlex${index}`), row = flex(screen.root);
      expect(row.intrinsicFlex, profile.id).toBeDefined();
      const context: EmitContext = { mode: "app", screen, fontMetrics: {}, nameOf: new Map(), shapes: {}, control: { decls: [], stateOf: new Map(), actionOf: new Map() }, renderNode(node) {
        const core = node.kind === "text" ? textExpr(node, context) : node.kind === "control" ? controlExpr(node, {
          mode: "app", theme: "light", stateOf: new Map(), actionOf: new Map(), child: child => context.renderNode(child).split("\n"),
        }) : (() => { throw new Error("Unproved native control"); })();
        return [...core, ...modifiers(node, context)].join("\n");
      } };
      // Executes the production expression, with only the platform font type substituted.
      views.push(`struct FlexView${index}: View { var body: some View { ${intrinsicFlexExpr(row, context).join("\n").replaceAll("UIFont", "NSFont")} } }`);
      for (const width of [320, 390, 500]) {
        await page.setViewportSize({ width, height: 420 });
        await page.setContent(`<style>${css}</style>${html}`);
        const reference = await page.evaluate(() => {
          const host = document.querySelector("#flex")!.getBoundingClientRect();
          const items = [...document.querySelectorAll(".item")].map(item => {
            const rect = item.getBoundingClientRect(); return { x: rect.x - host.x, y: rect.y - host.y, w: rect.width, h: rect.height };
          });
          return { width: host.width, height: host.height, items };
        });
        if (profile.id === "intrinsic-auto-minimum") expect(reference.items[0]!.w).toBeGreaterThan(reference.width);
        if (profile.id === "intrinsic-singleton-shrink") expect(reference.items[0]!.w).toBe(reference.width);
        probes.push(`let renderer${probes.length} = ImageRenderer(content: FlexProbe(label: "${profile.id}-${width}", width: ${reference.width}, height: ${reference.height}) { FlexView${index}() })\n_ = renderer${probes.length}.cgImage`);
      }
    }
    await Bun.write(join(directory, "proof.swift"), `import SwiftUI\nimport CoreText\n${ALLOCATION_CORE}\n${INTRINSIC_FLEX_RUNTIME}\n${FLOW_RUNTIME}\n${GREEDY_TEXT_RUNTIME.replaceAll("UIFont", "NSFont")}\n${TEXT_LINE_BOX_RUNTIME.replaceAll("UIFont", "NSFont")}
extension Color { nonisolated static func markswift(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> Color { Color(.sRGB, red: r, green: g, blue: b, opacity: a) } }
struct FlexProbe: Layout {
    let label: String
    let width: CGFloat
    let height: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let measured = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        precondition(abs(measured.width - width) < 0.001, "width \\(label) \\(measured.width) expected \\(width)")
        precondition(abs(measured.height - height) < 0.5, "height \\(label) \\(measured.height) expected \\(height)")
        print("passed", label)
        return measured
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
}
${views.join("\n")}
${probes.join("\n")}
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, code] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(code, error).toBe(0); expect(error).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, runError, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(exit, runError).toBe(0);
    expect(new Set(output.split("\n").filter(line => line.startsWith("passed "))).size).toBe(probes.length);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
}, 60000);

nativeBrowserTest("all intrinsic flex controls retain actions and compile as complete iOS SDK bundles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-intrinsic-flex-sdk-"));
  try {
    const inputs = [];
    for (const [index, profile] of intrinsicFlexControls.entries()) {
      const { html, css } = intrinsicFlexControl(profile);
      const captured = await convertHtml(html, { root: "#corpus", css, mode: "app", viewport: { width: 390, height: 420 } });
      for (const mode of ["app", "fidelity"] as const) inputs.push({ layout: captured.layout, name: `IntrinsicSDK${index}${mode}`, mode });
    }
    const compiled = compileLayouts(inputs), code = Object.values(compiled.files).join("\n");
    expect(code).toContain("MarkswiftIntrinsicFlex(");
    expect(code).toContain("on_saveChanges");
    expect(code).toContain(".underline(");
    for (const [name, content] of Object.entries(compiled.files)) await Bun.write(join(directory, name), content);
    const checked = await typecheck(directory); expect(checked.ok, checked.output).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

browserTest("computed font overrides and merged descendant spans retain explicit intrinsic fallback", async () => {
  const { html, css } = intrinsicFlexControl(intrinsicFlexControls[0]);
  for (const [property, value] of [["font-kerning", "none"], ["font-feature-settings", '"kern" 0'], ["font-variant-ligatures", "none"], ["unicode-bidi", "bidi-override"]] as const) {
    const captured = await convertHtml(html, { root: "#corpus", css: `${css}.item{${property}:${value}}`, name: "FontSettingFallback", mode: "app", viewport: { width: 390, height: 420 } });
    const item = captured.layout.root.children[0]!.children[0]!;
    expect(item.styles[property]).toBe(value!);
    const row = flex(inferScreen(captured.layout, "FontSettingFallback").root);
    expect(row.intrinsicFlex).toBeUndefined(); expect(row.measured).toBeDefined();
    expect(row.notes.join(" ")).toContain(`${property}:${value}`);
    expect(row.notes.join(" ")).toContain("native glyph styling may differ");
  }
  const nested = html.replace("Computed CSS", '<span style="font-kerning:none">Computed CSS</span>');
  const captured = await convertHtml(nested, { root: "#corpus", css, mode: "app", viewport: { width: 390, height: 420 } });
  const row = flex(inferScreen(captured.layout, "MergedFontSetting").root);
  expect(row.intrinsicFlex).toBeUndefined();
  expect(row.notes.join(" ")).toContain("font-kerning:none");
}, 30000);

browserTest("intrinsic font admission leaves legacy greedy paragraph emission unchanged", async () => {
  const result = await convertHtml('<main id="root"><p>AVATAR office words remain on the legacy paragraph route</p></main>', {
    root: "#root", css: "body{margin:0}main{width:100%;font:24px/30px system-ui;font-kerning:none}p{margin:0}", mode: "app", viewport: { width: 390, height: 420 },
  });
  expect(result.layout.root.children[0]!.styles["font-kerning"]).toBe("none");
  expect(result.code).toContain("MarkswiftGreedyText(");
  expect(result.code).not.toContain("MarkswiftIntrinsicFlex(");
}, 30000);
