import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { compileLayout, type LayoutDoc } from "../../src/compiler/index.ts";
import { readChromeGeometry } from "../../tools/verify/geometry-chrome.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { GEOMETRY_HTML, GEOMETRY_CSS, GEOMETRY_WIDTHS } from "../helpers/geometry-fixture.ts";
import { ALLOCATION_RUNTIME } from "../../src/swift/allocation-runtime.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { StackNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

browserTest("independent Chrome oracle observes fresh painted borders, scroll viewport and boxless composed elements", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const widths: number[] = [];
    for (const width of GEOMETRY_WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.setContent(`<style>${GEOMETRY_CSS}</style>${GEOMETRY_HTML}`);
      const result = await readChromeGeometry(page, "#geometry-root");
      expect(result).toMatchObject({ width, height: 960, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb" });
      const translated = result.elements.find(node => node.sourceId === "#translated")!.frame!;
      const rotated = result.elements.find(node => node.sourceId === "#rotated")!.frame!;
      expect(translated.x).toBe(23); expect(translated.w).toBe(60);
      expect(rotated.w).toBeGreaterThan(60); expect(rotated.h).toBeGreaterThan(40);
      expect(result.elements.find(node => node.sourceId === "#scroll")!.frame!.h).toBe(80);
      expect(result.elements.find(node => node.sourceId === "#scroll")!.scroll).toMatchObject({ height: 120, viewportHeight: 80, transformed: false });
      for (const id of ["#text-max", "#text-max-a", "#text-max-b"]) expect(result.elements.find(node => node.sourceId === id)!.frame!.h).toBe(40);
      expect(result.elements.find(node => node.sourceId === "#scroll-b")!.frame!.y).toBeGreaterThan(result.elements.find(node => node.sourceId === "#scroll-a")!.frame!.y);
      widths.push(result.elements.find(node => node.sourceId === "#flex-b")!.frame!.w);
      await page.close();
    }
    expect(widths[0]!).toBeLessThan(widths[1]!); expect(widths[1]!).toBeLessThan(widths[2]!);
    const page = await browser.newPage();
    await page.setContent(`<main id="root" style="width:200px;height:100px"><div id="contents" style="display:contents"><div id="leaf" style="width:40px;height:20px"></div></div><div id="hidden" style="display:none"></div><x-host id="host"></x-host></main>`);
    await page.evaluate(() => { document.querySelector("x-host")!.attachShadow({ mode: "open" }).innerHTML = `<slot></slot><div id="shadow" style="width:30px;height:10px"></div>`; });
    const result = await readChromeGeometry(page, "main");
    expect(result.elements.find(node => node.sourceId === "#contents")?.rendered).toBe(false);
    expect(result.elements.find(node => node.sourceId === "#hidden")?.frame).toBeUndefined();
    expect(result.elements.find(node => node.sourceId === "#leaf")?.path).toBe("0/0");
    expect(result.elements.find(node => node.sourceId === "#shadow")?.path).toBe("2/1");
  } finally { await browser.close(); }
}, 30_000);

nativeTest("geometry emission and native reader typecheck in both modes and actor defaults", async () => {
  const layout: LayoutDoc = { version: 1, source: "geometry.html", combo: { screen: "geometry", theme: "light", demoState: "normal" }, size: { w: 390, h: 640 }, dpr: 1, canvas: "rgb(255, 255, 255)",
    root: { id: "root", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 390, h: 640 }, children: [] } };
  const directory = await mkdtemp(join(tmpdir(), "markswift-geometry-typecheck-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(layout, { name: "Observed", mode, geometryInstrumentation: true });
      for (const [path, source] of Object.entries(bundle.files)) await writeFile(join(directory, path), source);
      await writeFile(join(directory, "Reader.swift"), `import SwiftUI\nstruct Reader: View { let collector = MarkswiftGeometryCollector(); var body: some View { MarkswiftGeometryReader(content: Observed(), collector: collector) } }\n`);
      for (const defaultIsolationMainActor of [false, true]) {
        const result = await typecheck(directory, { ...TYPECHECK_TARGET, defaultIsolationMainActor });
        expect(result.output).toBe(""); expect(result.ok).toBe(true);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120_000);

browserTest("one captured layout emits geometry identities without changing inference diagnostics", async () => {
  const captured = await convertHtml(GEOMETRY_HTML, { css: GEOMETRY_CSS, viewport: { width: 390, height: 800 } });
  const root = inferScreen(captured.layout, "GeometryProbe").root as StackNode;
  const capped = root.children.find(node => node.id === "#text-max") as StackNode;
  expect(capped.children.map(node => [node.height.kind, node.minHeight])).toEqual([["fill", 0], ["fill", 0]]);
  for (const mode of ["app", "fidelity"] as const) {
    const plain = compileLayout(captured.layout, { name: "GeometryProbe", mode });
    const observed = compileLayout(captured.layout, { name: "GeometryProbe", mode, geometryInstrumentation: true });
    expect(observed.code.split("\n").filter(line => !line.includes(".markswiftObserveGeometry(")).join("\n")).toBe(plain.code);
    expect(observed.mapping).toEqual(plain.mapping); expect(observed.diagnostics).toEqual(plain.diagnostics);
    expect(observed.geometry!.nodes.find(node => node.sourceId === "#scroll" && node.role === "scroll-viewport")?.instrumented).toBe(true);
  }
}, 30_000);

browserTest("independent CDP pseudo borders preserve composed identities, transforms and viewport scrolling", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 300 } });
    await page.setContent(`<style>body{margin:0}*{box-sizing:border-box}main{width:390px;height:600px;margin-top:500px;padding:20px}#named{width:100px;height:40px;position:relative;transform:translate(7px,11px)}#named::before{content:"";position:absolute;box-sizing:border-box;width:37px;height:26px;left:2px;top:3px;transform:translate(5px,4px);border:2px solid red}#named::after{content:"after";display:block;height:20px}li{font:16px/20px serif}x-pseudo::before{content:"";display:block;width:11px;height:13px}</style><main id="root"><div id="named"></div><ul><li id="item">Marker</li></ul><x-pseudo id="host"></x-pseudo></main>`);
    await page.evaluate(() => { document.querySelector("x-pseudo")!.attachShadow({ mode: "open" }).innerHTML = `<style>div::after{content:"";display:block;width:17px;height:19px}</style><div id="shadow"></div>`; scrollTo(0, 450); });
    const result = await readChromeGeometry(page, "#root");
    expect(result.unavailableObservations).toBeUndefined();
    expect(result.elements.find(node => node.sourceId === "0/::before")).toMatchObject({ tag: "::before", observation: "pseudo-border", frame: { x: 34, y: 38, w: 37, h: 26 } });
    expect(result.elements.find(node => node.sourceId === "0/::after")?.frame?.h).toBe(20);
    expect(result.elements.find(node => node.sourceId === "1/0/::marker")?.frame?.h).toBe(20);
    expect(result.elements.find(node => node.sourceId === "2/::before")?.frame?.w).toBe(11);
    expect(result.elements.find(node => node.sourceId === "2/1/::after")?.frame).toMatchObject({ w: 17, h: 19 });
    // Element ids and pseudo paths remain separate contracts; a custom identity may collide.
    const collided = await readChromeGeometry(page, "#root", () => "collision");
    expect(collided.elements.filter(node => node.sourceId === "collision").length).toBe(result.elements.length);
  } finally { await browser.close(); }
}, 30_000);

browserTest("closed details layout boxes remain unpainted while authored details-content overrides stay observed", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>main{width:300px;height:300px}#override::details-content{content-visibility:visible}#closed-child::before,#override-child::before{content:"";display:block;width:20px;height:10px}</style><main><details><summary>Closed</summary><div id="closed-child"><span id="closed-inline">Not painted</span></div></details><details id="override"><summary>Author override</summary><div id="override-child">Painted</div></details></main>`);
    const forced = await page.locator("#closed-child").evaluate(element => { const height = element.getBoundingClientRect().height; return { clientRects: element.getClientRects().length, height, visible: element.checkVisibility() }; });
    expect(forced.clientRects).toBe(1); expect(forced.height).toBeGreaterThan(0); expect(forced.visible).toBe(false);
    const result = await readChromeGeometry(page, "main");
    expect(result.elements.find(node => node.sourceId === "#closed-child")).toMatchObject({ rendered: false, visibility: "unpainted" });
    expect(result.elements.find(node => node.sourceId === "#closed-inline")?.frame).toBeUndefined();
    expect(result.elements.find(node => node.sourceId === "0/1/::before")).toMatchObject({ rendered: false, visibility: "unpainted" });
    expect(result.elements.find(node => node.sourceId === "#override-child")?.rendered).toBe(true);
    expect(result.elements.find(node => node.sourceId === "1/1/::before")?.frame).toMatchObject({ w: 20, h: 10 });
    expect(result.unavailableObservations).toBeUndefined();
  } finally { await browser.close(); }
}, 30_000);

nativeTest("emitted allocation runtime measures CoreText at each width and clamps auto height before stretching", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-intrinsic-height-"));
  try {
    const source = `import Foundation
import CoreText
protocol Layout { typealias Subviews = [Probe] }
struct ProposedViewSize { var width: CGFloat?; var height: CGFloat? }
enum VerticalAlignment { case top, center, bottom }
enum UnitPoint { case topLeading }
final class Probe {
  var frame = CGRect.zero
  func sizeThatFits(_ proposal: ProposedViewSize) -> CGSize {
    let font = CTFontCreateWithName("Courier New" as CFString, 16, nil)
    let text = NSAttributedString(string: String(repeating: "M", count: 45), attributes: [.init(kCTFontAttributeName as String): font])
    return CTFramesetterSuggestFrameSizeWithConstraints(CTFramesetterCreateWithAttributedString(text), CFRange(location: 0, length: 0), nil,
      CGSize(width: proposal.width ?? 10000, height: 10000), nil)
  }
  func place(at point: CGPoint, anchor: UnitPoint, proposal: ProposedViewSize) { frame = CGRect(origin: point, size: CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)) }
}
${ALLOCATION_RUNTIME}
let tracks = [MarkswiftAllocationTrack(basis: 0, grow: 1, shrink: 1, min: 0), MarkswiftAllocationTrack(basis: 0, grow: 1, shrink: 1, min: 0)]
var naturalHeights: [CGFloat] = []
for width: CGFloat in [320, 390, 500] {
  let children = [Probe(), Probe()]
  var cache = ()
  let proposal = ProposedViewSize(width: width, height: 600)
  for (minimum, maximum) in [(CGFloat(0), CGFloat?.none), (100, CGFloat?.none), (0, CGFloat?.some(20))] {
    let layout = MarkswiftAllocatedLayout(tracks: tracks, columnGap: 12, stretch: true, intrinsicHeight: true, minimumHeight: minimum, maximumHeight: maximum, capturedWidth: 390)
    let size = layout.sizeThatFits(proposal: proposal, subviews: children, cache: &cache)
    let measured = children[0].sizeThatFits(ProposedViewSize(width: (width - 12) / 2, height: nil)).height
    precondition(abs(size.height - max(minimum, min(maximum ?? .infinity, measured))) < 0.001)
    precondition(size.height < 600)
    layout.placeSubviews(in: CGRect(origin: .zero, size: size), proposal: proposal, subviews: children, cache: &cache)
    precondition(children.allSatisfy { $0.frame.height == size.height })
    if minimum == 0 && maximum == nil { naturalHeights.append(size.height) }
  }
  let legacy = MarkswiftAllocatedLayout(tracks: tracks, columnGap: 12, capturedWidth: 390)
  precondition(legacy.sizeThatFits(proposal: proposal, subviews: children, cache: &cache).height == 600)
}
precondition(naturalHeights.first! > naturalHeights.last!)
print("real emitted intrinsic-height layout passed at 320,390,500 with CoreText and excess600pt proposal")
`;
    const path = join(directory, "proof.swift"), executable = join(directory, "proof");
    await writeFile(path, source);
    const compiler = Bun.spawn(["xcrun", "swiftc", path, "-o", executable], { stdout: "pipe", stderr: "pipe" });
    const [error, exit] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(exit, error).toBe(0);
    const native = Bun.spawn([executable], { stdout: "pipe", stderr: "pipe" });
    const [executionError, executionExit] = await Promise.all([new Response(native.stderr).text(), native.exited]);
    expect(executionExit, executionError).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
