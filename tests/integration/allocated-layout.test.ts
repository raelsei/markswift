import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { SemNode, GridNode, StackNode } from "../../src/model/semantic.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { ALLOCATION_RUNTIME } from "../../src/swift/allocation-runtime.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { flexAllocatedWidths, gridAllocatedWidths } from "../../src/analysis/allocation.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const css = `body{margin:0}*{box-sizing:border-box}main{padding:16px;font:16px/20px "Courier New",monospace}
section{gap:12px;margin-bottom:12px}article{min-width:0;word-break:break-all}
#grow,#paddedgrow,#basis,#shrink,#partial{display:flex;align-items:stretch}#grow article{flex:1 1 0%}#grow article:nth-child(2){flex-grow:2;max-width:130px}
#paddedgrow article{flex:1 1 0%;padding:4px;border:1px solid black}#paddedgrow article:nth-child(2){flex-grow:2}
#basis article:nth-child(1){flex:1 1 40px}#basis article:nth-child(2){flex:2 1 80px}
#shrink article{flex:0 1 160px;padding:4px;border:1px solid black}#shrink article:nth-child(2){flex-shrink:2;min-width:88px}
#partial article{flex:0.25 1 40px}#grid,#minimum{display:grid;grid-template-columns:64px minmax(0,1fr) minmax(0,2fr)}
#minimum{grid-template-columns:64px minmax(100px,1fr) minmax(0,2fr)}
#fixedrows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:110px}
#percentmixed,#percentboxes,#percentcontent,#percentcaps,#percentgrowth,#percentwidth,#percentstatic,#percentfloor,#percentcenter{display:flex;align-items:stretch}
#percentmixed{padding:8px;border:2px solid black}#percentmixed article:nth-child(1){flex:0 1 25%}#percentmixed article:nth-child(2){flex:2 1 35%}#percentmixed article:nth-child(3){flex:1 2 40px}
#percentboxes article,#percentcontent article{flex:0 1 50%;padding:4px;border:1px solid black}
#percentcontent article{box-sizing:content-box}
#percentcaps article:nth-child(1){flex:1 1 55%;max-width:180px}#percentcaps article:nth-child(2){flex:2 2 65%;min-width:112px}#percentcaps article:nth-child(3){flex:1 1 80px;max-width:90px}
#percentgrowth article:nth-child(1){flex:0.2 1 15%}#percentgrowth article:nth-child(2){flex:0.3 1 20%}
#percentwidth article{flex:0 1 auto;width:33.3333%}
#percentstatic article:nth-child(1){flex:0 0 25%}#percentstatic article:nth-child(2){flex:0 0 35%}
#percentfloor article{padding:4px;border:1px solid black}#percentfloor article:nth-child(1){flex:1 1 3%}#percentfloor article:nth-child(2){flex:2 1 6%}
#percentcenter{height:180px;align-items:center}#percentcenter article{flex:0 1 50%}
#gridspan,#gridholes,#gridmixedrows,#gridrowpattern,#gridnegative,#gridorder,#gridrowlocked,#gridfixedcols,#gridemptyfixed{display:grid;grid-template-columns:64px minmax(0,1fr) minmax(0,2fr)}
#gridspan article:nth-child(odd){grid-column:span 2;padding:4px;border:1px solid black}
#gridholes article:nth-child(1){grid-column:3;grid-row:2}#gridholes article:nth-child(2){grid-column:1 / span 2;grid-row:5}
#gridmixedrows{grid-template-rows:40px auto 80px}#gridmixedrows article:nth-child(1){grid-row:1;grid-column:1 / 4}#gridmixedrows article:nth-child(2){grid-row:2;grid-column:2 / 4}#gridmixedrows article:nth-child(3){grid-row:3;grid-column:3}
#gridrowpattern{grid-auto-rows:auto 80px}#gridrowpattern article{grid-column:span 2}
#gridnegative{grid-template-rows:repeat(3,auto)}#gridnegative article:nth-child(1){grid-column:span 2 / -1;grid-row:-3}#gridnegative article:nth-child(2){grid-column:1 / -1;grid-row:1}#gridnegative article:nth-child(3){grid-column:4 / 2;grid-row:3}
#gridorder article:nth-child(1){order:2;grid-column:span 2}#gridorder article:nth-child(2){order:-1;grid-column:3}#gridorder article:nth-child(3){grid-column:span 2}
#gridrowlocked article:nth-child(2){grid-row:1;grid-column:span 2}#gridrowlocked article:nth-child(3){grid-column:3}
#gridfixedcols{grid-template-columns:64px 80px 90px}#gridfixedcols article:first-child{grid-column:span 2}
#gridemptyfixed{grid-template-rows:50px auto 70px auto;grid-auto-rows:60px auto}#gridemptyfixed article:nth-child(1){grid-row:2;grid-column:2 / 4}#gridemptyfixed article:nth-child(2){grid-row:4;grid-column:1 / 4}#gridemptyfixed article:nth-child(3){grid-row:6;grid-column:3}`;
const content = (count: number) => "M".repeat(count);
const ids = ["grow", "paddedgrow", "basis", "shrink", "partial", "grid", "minimum", "fixedrows",
  "percentmixed", "percentboxes", "percentcontent", "percentcaps", "percentgrowth", "percentwidth", "percentstatic", "percentfloor", "percentcenter",
  "gridspan", "gridholes", "gridmixedrows", "gridrowpattern", "gridnegative", "gridorder", "gridrowlocked", "gridfixedcols", "gridemptyfixed"];
const html = `<main data-markswift-root>${ids.map(id =>
  `<section id="${id}">${[32, 44, ...(/^(basis|percentboxes|percentcontent|percentgrowth|percentstatic|percentfloor|percentcenter)$/.test(id) ? [] : [52]), ...(/^(gridspan|gridholes|gridrowpattern|gridorder|gridrowlocked)$/.test(id) ? [20, 64] : [])].map(count => `<article>${content(count)}</article>`).join("")}</section>`).join("")}</main>`;

function find(node: SemNode, id: string): GridNode | StackNode {
  if (node.id === `#${id}` && (node.kind === "grid" || node.kind === "stack")) return node;
  for (const child of "children" in node ? node.children : []) { try { return find(child, id); } catch { /* next */ } }
  throw new Error(`Missing ${id}`);
}

// Execute the emitted Layout implementation on macOS with a small Layout API adapter.
// Native text is measured using CoreText; no copied allocation or row-height algorithm lives here.
async function executeNative(cases: Array<{ width: number; node: GridNode | StackNode }>): Promise<Array<{ height: number; frames: Array<{ x: number; y: number; w: number; h: number }> }>> {
  const directory = await mkdtemp(join(tmpdir(), "markswift-allocation-execution-"));
  try {
    const declarations = cases.map(({ width, node }) => {
      const tracks = node.kind === "grid" ? node.tracks! : node.allocation!.tracks;
      const parameters = tracks.map(track => `MarkswiftAllocationTrack(basis: ${track.basis}, grow: ${track.grow}, shrink: ${track.shrink}, min: ${track.min}, max: ${track.max ?? "nil"}, inset: ${track.inset ?? 0}, basisFraction: ${track.basisFraction ?? "nil"})`).join(",");
      const probes = node.children.map(child => {
        const text = child.kind === "text" ? child.runs.map(run => run.text).join("") : "";
        const inset = child.padding[1] + child.padding[3], verticalInset = child.padding[0] + child.padding[2];
        return `NativeProbe(text: ${JSON.stringify(text)}, inset: ${inset}, verticalInset: ${verticalInset}, fixedHeight: ${child.height.kind === "fixed" ? child.height.px : "nil"})`;
      }).join(",");
      const vertical = node.kind === "stack" && node.align === "center" ? ".center" : node.kind === "stack" && node.align === "end" ? ".bottom" : ".top";
      const placements = node.kind === "grid" && node.placements ? `, placements: [${node.placements.map(p => `MarkswiftGridPlacement(row: ${p.row}, column: ${p.column}, columnSpan: ${p.columnSpan})`).join(",")}]` : "";
      const rowSizes = node.kind === "grid" && node.rowSizes ? `, rowSizes: [${node.rowSizes.map(size => size ?? "nil").join(",")}]` : "";
      return `run(MarkswiftAllocatedLayout(tracks: [${parameters}], columnGap: ${node.kind === "grid" ? node.hSpacing : node.spacing}, rowGap: ${node.kind === "grid" ? node.vSpacing : 0}, grid: ${node.kind === "grid"}, vertical: ${vertical}, stretch: ${node.kind === "grid" || node.align === "stretch"}${placements}${rowSizes}, capturedWidth: ${node.frame.w - node.padding[1] - node.padding[3]}), ${width}, height: ${node.height.kind === "fixed" ? node.height.px - node.padding[0] - node.padding[2] : "nil"}, [${probes}])`;
    }).join("\n");
    const source = `import Foundation
import CoreText
protocol Layout { typealias Subviews = [NativeProbe] }
struct ProposedViewSize { var width: CGFloat?; var height: CGFloat? }
enum VerticalAlignment { case top, center, bottom }
enum UnitPoint { case topLeading }
final class NativeProbe {
  var text: String; var inset: CGFloat; var verticalInset: CGFloat; var fixedHeight: CGFloat?; var frame = CGRect.zero
  init(text: String, inset: CGFloat, verticalInset: CGFloat, fixedHeight: CGFloat?) { self.text = text; self.inset = inset; self.verticalInset = verticalInset; self.fixedHeight = fixedHeight }
  func sizeThatFits(_ proposal: ProposedViewSize) -> CGSize {
    let width = proposal.width ?? 100000
    let font = CTFontCreateWithName("Courier New" as CFString, 16, nil)
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: "M", attributes: [.init(kCTFontAttributeName as String): font]))
    let advance = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    let capacity = max(1, floor((width - inset + 0.00001) / advance))
    return CGSize(width: width, height: fixedHeight ?? (ceil(CGFloat(text.count) / capacity) * 20 + verticalInset))
  }
  func place(at point: CGPoint, anchor: UnitPoint, proposal: ProposedViewSize) {
    frame = CGRect(origin: point, size: CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0))
  }
}
${ALLOCATION_RUNTIME}
func run(_ layout: MarkswiftAllocatedLayout, _ width: CGFloat, height: CGFloat?, _ subviews: [NativeProbe]) {
  var cache = (); let proposal = ProposedViewSize(width: width, height: height)
  let size = layout.sizeThatFits(proposal: proposal, subviews: subviews, cache: &cache)
  layout.placeSubviews(in: CGRect(x: 0, y: 0, width: width, height: size.height), proposal: proposal, subviews: subviews, cache: &cache)
  let result: [String: Any] = ["height": size.height, "frames": subviews.map { ["x": $0.frame.minX, "y": $0.frame.minY, "w": $0.frame.width, "h": $0.frame.height] }]
  print(String(data: try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
}
${declarations}
`;
    const path = join(directory, "allocation.swift"), executable = join(directory, "allocation");
    await writeFile(path, source);
    await $`xcrun swiftc ${path} -o ${executable}`.quiet();
    return (await $`${executable}`.text()).trim().split("\n").map(line => JSON.parse(line));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function capturesAtProofWidths() {
  const captures = [];
  for (const width of [390, 320, 500]) captures.push(await convertHtml(html, { name: "Allocated", css, viewport: { width, height: 2400 } }));
  const roots = captures.map(result => inferScreen(result.layout, "Allocated").root);
  const cases = [390, 320, 500].flatMap(width => ids.map(id => {
    const node = find(roots[0]!, id);
    return { width: width - 32 - node.padding[1] - node.padding[3], node };
  }));
  return { captures, roots, ids, cases };
}
let sharedCaptures: ReturnType<typeof capturesAtProofWidths> | undefined;
function proofCaptures() { return sharedCaptures ??= capturesAtProofWidths(); }

browserTest("one capture retains CSS allocation rules for fixed and percentage bases at 320, 390 and 500", async () => {
  const { captures, roots, ids, cases } = await proofCaptures();
  cases.forEach(({ width, node }, index) => {
    const tracks = node.kind === "grid" ? node.tracks : node.allocation?.tracks;
    expect(tracks, `${node.id}: ${node.notes.join("; ")}`).toBeDefined();
    const browser = find(roots[Math.floor(index / ids.length)]!, ids[index % ids.length]!);
    const gap = node.kind === "grid" ? node.hSpacing : node.spacing as number;
    const available = width - (tracks!.length - 1) * gap;
    const allocated = node.kind === "grid" ? gridAllocatedWidths(available, tracks!) : flexAllocatedWidths(available, tracks!, width);
    let x = 0;
    browser.children.forEach((child, i) => {
      const placement = node.kind === "grid" ? node.placements?.[i] : undefined;
      const column = placement?.column ?? (node.kind === "grid" ? i % node.columns : i);
      const span = placement?.columnSpan ?? 1;
      if (node.kind === "grid") x = allocated.slice(0, column).reduce((sum, size) => sum + size + gap, 0);
      const width = allocated.slice(column, column + span).reduce((sum, size) => sum + size, 0) + (span - 1) * gap;
      expect(width).toBeCloseTo(child.frame.w, 1);
      expect(x).toBeCloseTo(child.frame.x - browser.frame.x - browser.padding[3], 1);
      x += allocated[column]! + gap;
    });
  });
  expect(find(roots[1]!, "basis").frame.h).toBeGreaterThan(find(roots[0]!, "basis").frame.h);
  const percent = find(roots[0]!, "percentwidth") as StackNode;
  expect(percent.allocation!.tracks[0]!.basisFraction).toBe(0.333333);
  expect(percent.children.flatMap(child => child.notes).some(note => note.includes("may not resize proportionally"))).toBe(false);
  const grid = find(roots[0]!, "gridemptyfixed") as GridNode;
  expect(grid.rowSizes).toEqual([50, null, 70, null, 60, null]);
  expect(grid.placements).toEqual([{ row: 1, column: 1, columnSpan: 2 }, { row: 3, column: 0, columnSpan: 3 }, { row: 5, column: 2, columnSpan: 1 }]);
  const serialized = compileLayout(JSON.parse(JSON.stringify(captures[0]!.layout)), { name: "SerializedGrid", mode: "app" });
  expect(serialized.code).toContain("columnSpan: 3");
  expect(serialized.code).toContain("rowSizes: [50.0, nil, 70.0, nil, 60.0, nil]");
  for (const mode of ["app", "fidelity"] as const) {
    const bundle = compileLayout(captures[0]!.layout, { name: "Allocated", mode });
    expect(bundle.code.includes("MarkswiftAllocatedLayout(")).toBe(mode === "app");
    if (mode === "app") expect(bundle.code).toContain("basisFraction: 0.333333");
  }
}, 60_000);

nativeTest("emitted native allocation and text measurement agree at all three browser widths", async () => {
  const { roots, ids, cases } = await proofCaptures();
  for (const { node } of cases) expect(node.kind === "grid" ? node.tracks : node.allocation?.tracks).toBeDefined();
  const native = await executeNative(cases);
  cases.forEach(({ node }, index) => {
    const browser = find(roots[Math.floor(index / ids.length)]!, ids[index % ids.length]!);
    const measured = native[index]!;
    expect(measured.height, `${node.id} at ${[390, 320, 500][Math.floor(index / ids.length)]}`).toBeCloseTo(browser.frame.h - browser.padding[0] - browser.padding[2], 1);
    browser.children.forEach((child, i) => {
      expect(measured.frames[i]!.x).toBeCloseTo(child.frame.x - browser.frame.x - browser.padding[3], 1);
      expect(measured.frames[i]!.y).toBeCloseTo(child.frame.y - browser.frame.y - browser.padding[0], 1);
      expect(measured.frames[i]!.w).toBeCloseTo(child.frame.w, 1);
      expect(measured.frames[i]!.h).toBeCloseTo(child.frame.h, 1);
    });
  });
  const legacy = structuredClone(find(roots[0]!, "grid")) as GridNode;
  delete legacy.placements;
  delete legacy.rowSizes;
  const legacyResult = await executeNative([{ node: legacy, width: legacy.frame.w - legacy.padding[1] - legacy.padding[3] }]);
  expect(legacyResult[0]).toEqual(native[ids.indexOf("grid")]);
}, 60_000);

browserTest("unproved grid placement remains captured with a specific reason", async () => {
  const markup = `<main data-markswift-root><section id="grid"><article>${content(32)}</article><article>${content(22)}</article></section></main>`;
  const unsupported: Array<[string, string]> = [
    ["#grid article:first-child{grid-row:span 2}", "row spans"],
    ["#grid{grid-auto-flow:column}", "column grid auto-flow"],
    ["#grid{grid-auto-flow:row dense}", "dense"],
    ["#grid article:first-child{grid-column:3 / span 2}", "implicit grid columns"],
    ["#grid{grid-template-columns:[named] 64px minmax(0,1fr) minmax(0,2fr)}#grid article:first-child{grid-column:named}", "named or unproved grid lines"],
    ["#grid article{grid-row:1;grid-column:1}", "overlapping grid cells"],
    ["#grid{grid-auto-rows:minmax(40px,auto)}", "unproved grid row sizing"],
  ];
  for (const [change, reason] of unsupported) {
    const result = await convertHtml(markup, { name: "CapturedGridPlacement", css: css + change, viewport: { width: 390, height: 400 } });
    const node = find(inferScreen(result.layout, "CapturedGridPlacement").root, "grid") as GridNode;
    expect(node.tracks, change).toBeUndefined();
    expect(node.measured, change).toBeDefined();
    expect(node.notes.join(" "), change).toContain(reason);
  }
  const capture = (await proofCaptures()).captures[0]!.layout;
  const serialized = JSON.parse(JSON.stringify(capture));
  const clearDefiniteness = (node: LayoutNode) => { if (node.preferredSize) delete node.preferredSize.inlineSizeDefinite; node.children.forEach(clearDefiniteness); };
  clearDefiniteness(serialized.root);
  const ambiguous = find(inferScreen(serialized, "LegacyPlacedGrid").root, "gridspan") as GridNode;
  expect(ambiguous.tracks).toBeUndefined();
  expect(ambiguous.notes.join(" ")).toContain("indefinite grid container");
}, 60_000);

browserTest("intrinsic tracks, row spans, calculated bases and dense flow stay captured", async () => {
  for (const change of ["#grid{grid-template-columns:min-content 1fr 2fr}", "#grid article:first-child{grid-row:span 2}", "#basis article:first-child{flex-basis:calc(30% + 8px)}", "#grid{grid-auto-flow:dense}", "#grid{min-height:600px}"]) {
    const result = await convertHtml(html, { name: "Captured", css: css + change, viewport: { width: 390, height: 1200 } });
    const node = find(inferScreen(result.layout, "Captured").root, change.includes("#basis") ? "basis" : "grid");
    expect(node.kind === "grid" ? node.tracks : node.allocation).toBeUndefined();
    expect(node.measured, change).toBeDefined();
    expect(result.diagnostics.find(item => item.id === node.id)?.notes.some(note => note.includes("approximated:"))).toBe(true);
  }
}, 60_000);

browserTest("centered grid items remain captured when wrapping changes row alignment", async () => {
  const markup = `<main data-markswift-root><section id="grid"><article>${content(32)}</article><article>${content(22)}</article></section></main>`;
  for (const alignment of ["align-items:center", "justify-items:center"]) {
    const style = css + `#grid{grid-template-columns:repeat(2,minmax(0,1fr));${alignment}}`;
    const capture = await convertHtml(markup, { name: "CenteredGrid", css: style, viewport: { width: 390, height: 400 } });
    const source = find(inferScreen(capture.layout, "CenteredGrid").root, "grid") as GridNode;
    expect(source.tracks, alignment).toBeUndefined();
    expect(source.measured, alignment).toBeDefined();
    expect(source.notes.join(" ")).toContain("item alignment");
    const narrower = await convertHtml(markup, { name: "CenteredGrid", css: style, viewport: { width: 320, height: 400 } });
    const other = find(inferScreen(narrower.layout, "CenteredGrid").root, "grid");
    if (alignment.startsWith("align-items")) {
      expect(source.children.map(child => child.frame.h)).toEqual([40, 40]);
      expect(other.children.map(child => child.frame.h)).toEqual([60, 40]);
      expect(other.children[1]!.frame.y - other.frame.y).toBe(10);
    }
  }
}, 60_000);

browserTest("auto flex margins remain captured even when their initial used value is zero", async () => {
  const markup = `<main data-markswift-root><section id="basis"><article>A</article><article>B</article></section></main>`;
  const style = css + `main{padding:0}#basis{gap:0}#basis article:nth-child(n){flex:1 1 100px;max-width:200px}#basis article:first-child{margin-left:auto}`;
  const captures = [];
  for (const width of [390, 500]) captures.push(await convertHtml(markup, { name: "AutoMargins", css: style, viewport: { width, height: 400 } }));
  const node = find(inferScreen(captures[0]!.layout, "AutoMargins").root, "basis") as StackNode;
  expect(node.allocation).toBeUndefined();
  expect(node.measured).toBeDefined();
  expect(node.notes.join(" ")).toContain("auto item margins");
  const wider = find(inferScreen(captures[1]!.layout, "AutoMargins").root, "basis");
  expect(node.children[0]!.frame.x - node.frame.x).toBe(0);
  expect(wider.children[0]!.frame.x - wider.frame.x).toBe(100);
}, 60_000);

browserTest("unproved automatic minimum on percentage allocation stays diagnosed and captured", async () => {
  const markup = `<main data-markswift-root><section id="basis"><article>A</article><article>B</article></section></main>`;
  const style = css + `main{padding:0}#basis article:nth-child(n){flex:0 1 50%;min-width:auto}`;
  const captures = [];
  for (const width of [390, 320]) captures.push(await convertHtml(markup, { name: "PercentageShrink", css: style, viewport: { width, height: 400 } }));
  const nodes = captures.map(capture => find(inferScreen(capture.layout, "PercentageShrink").root, "basis") as StackNode);
  expect(nodes[0]!.allocation).toBeUndefined();
  expect(nodes[0]!.measured).toBeDefined();
  expect(nodes[0]!.notes.join(" ")).toContain("automatic, intrinsic or percentage width constraint");
  expect(nodes.map(node => node.children[0]!.frame.w)).toEqual([189, 154]);
}, 60_000);

browserTest("percentage admission proves ancestors outside the capture and rejects intrinsic root contexts", async () => {
  const markup = `<div class="outer"><section data-markswift-root id="basis"><article>${content(16)}</article><article>${content(24)}</article></section></div>`;
  const style = `body{margin:0;font:16px/20px "Courier New"}#basis{display:flex;gap:12px}article{flex:0 1 50%;min-width:0;word-break:break-all}`;
  const normal = await convertHtml(markup, { name: "DefinitePercent", css: style, viewport: { width: 390, height: 400 } });
  expect(normal.layout.root.preferredSize?.width).toBe("auto");
  expect(normal.layout.root.preferredSize?.inlineSizeDefinite).toBe(true);
  const serialized = JSON.parse(JSON.stringify(normal.layout));
  expect((inferScreen(serialized, "SerializedPercent").root as StackNode).allocation?.tracks[0]?.basisFraction).toBe(0.5);
  delete serialized.root.preferredSize.inlineSizeDefinite;
  const legacy = inferScreen(serialized, "LegacyPercent").root as StackNode;
  expect(legacy.allocation).toBeUndefined();
  expect(legacy.notes.join(" ")).toContain("indefinite container");
  for (const display of ["inline-block", "inline-flex"]) {
    const result = await convertHtml(markup, { name: "IntrinsicPercent", css: style + `.outer{display:${display}}`, viewport: { width: 390, height: 400 } });
    expect(result.layout.root.preferredSize?.inlineSizeDefinite, display).toBe(false);
    const captured = inferScreen(result.layout, "IntrinsicPercent").root as StackNode;
    expect(captured.allocation, display).toBeUndefined();
    expect(captured.measured, display).toBeDefined();
    expect(captured.notes.join(" "), display).toContain("indefinite container");
  }
}, 60_000);

browserTest("relative padding stays diagnosed even when fixed and percentage allocations agree at capture", async () => {
  const markup = `<main data-markswift-root><section id="row"><article>${content(34)}</article><article>${content(44)}</article></section></main>`;
  const common = `body{margin:0}*{box-sizing:border-box}main{font:16px/20px "Courier New"}#row{gap:12px}article{min-width:0;word-break:break-all}`;
  for (const variant of ["percentage", "fixed", "grid", "container", "nested"]) {
    const allocation = variant === "grid" ? "#row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}"
      : `#row{display:flex}article{flex:${variant === "fixed" ? "1 1 40px" : "0 1 50%"}}`;
    const padding = variant === "container" ? "#row{padding:0 5%}"
      : variant === "nested" ? "article span{padding:0 5%;display:block}" : "article{padding:0 5%}";
    const captures = [];
    const html = variant === "nested" ? markup.replace(/<article>([^<]+)<\/article>/g, "<article><span>$1</span></article>") : markup;
    for (const width of [390, 320]) captures.push(await convertHtml(html, { name: "RelativePadding", css: common + allocation + padding, viewport: { width, height: 700 } }));
    const nodes = captures.map(capture => find(inferScreen(capture.layout, "RelativePadding").root, "row"));
    expect(nodes[0]!.kind === "grid" ? nodes[0]!.tracks : nodes[0]!.allocation, variant).toBeUndefined();
    expect(nodes[0]!.measured, variant).toBeDefined();
    expect(nodes[0]!.notes.join(" "), variant).toContain("relative padding");
    // Used pixels alone agree with the allocator at 390: retaining authored intent is
    // necessary to avoid claiming that this accidental agreement proves resizing.
    const stripped = structuredClone(captures[0]!.layout);
    const discardIntent = (node: LayoutNode) => {
      if (node.preferredSize) delete node.preferredSize.hasRelativePadding;
      node.children.forEach(discardIntent);
    };
    discardIntent(stripped.root);
    const accidental = find(inferScreen(stripped, "LostPaddingIntent").root, "row");
    expect(accidental.kind === "grid" ? accidental.tracks : accidental.allocation, variant).toBeDefined();
    const padded = (node: GridNode | StackNode): SemNode => variant === "container" ? node
      : variant === "nested" && node.children[0]!.kind === "stack" ? node.children[0]!.children[0]! : node.children[0]!;
    expect(padded(nodes[0]!).padding[3], variant).toBeGreaterThan(padded(nodes[1]!).padding[3]);
  }
}, 60_000);

browserTest("intrinsic effects labels retain responsive centering beside fixed native content", async () => {
  const fixtureDirectory = join(import.meta.dir, "../../tools/verify/fixtures");
  const markup = (await readFile(join(fixtureDirectory, "effects.html"), "utf8")).replace('class="vector"', 'class="vector" id="vector"');
  const style = await readFile(join(fixtureDirectory, "effects.css"), "utf8");
  const captures = [];
  for (const width of [390, 320]) captures.push(await convertHtml(markup, { name: "IntrinsicEffects", css: style, viewport: { width, height: 700 } }));
  const roots = captures.map(capture => inferScreen(capture.layout, "IntrinsicEffects").root);
  for (const id of ["linear-paint", "radial-paint", "shadow-paint", "pseudo-paint", "vector"]) {
    const nodes = roots.map(root => find(root, id) as StackNode);
    expect(nodes[0]!.measured, id).toBeUndefined();
    expect(nodes[0]!.allocation, id).toBeUndefined();
    expect(nodes[0]!.width.kind, id).toBe("fill");
    const labels = nodes.map(node => node.children.find(child => child.kind === "text")!);
    expect(labels[0]!.width.kind, id).toBe("hug");
    expect(labels[1]!.frame.w, id).toBeCloseTo(labels[0]!.frame.w, 1);
    if (id === "vector") {
      expect(nodes[0]!.children[0]!.width).toEqual({ kind: "fixed", px: 80 });
      expect(labels[0]!.frame.x).toBe(labels[1]!.frame.x);
    } else {
      expect(nodes[0]!.distribution, id).toBe("center");
      expect(labels[0]!.frame.x - labels[1]!.frame.x, id).toBeCloseTo(35, 1);
    }
    expect(nodes[0]!.notes.join(" "), id).toContain("intrinsic flex");
  }
  const bundle = compileLayout(captures[0]!.layout, { name: "IntrinsicEffects", mode: "app" });
  expect(bundle.code).not.toContain("MarkswiftMeasuredLayout(");
  expect(bundle.code).toContain("HStack(alignment: .center");
}, 60_000);

browserTest("a percentage grid gap cannot be admitted by accidental pixel agreement", async () => {
  const markup = `<main data-markswift-root><section id="grid"><article>A</article><article>B</article></section></main>`;
  const style = css + `main{padding:0}#grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:10%}`;
  const captures = [];
  for (const width of [100, 320]) captures.push(await convertHtml(markup, { name: "PercentageGap", css: style, viewport: { width, height: 200 } }));
  const nodes = captures.map(capture => find(inferScreen(capture.layout, "PercentageGap").root, "grid") as GridNode);
  expect(nodes[0]!.tracks).toBeUndefined();
  expect(nodes[0]!.measured).toBeDefined();
  expect(nodes[0]!.notes.join(" ")).toContain("relative or intrinsic grid gap");
  expect(nodes.map(node => node.children[1]!.frame.x - node.children[0]!.frame.x - node.children[0]!.frame.w)).toEqual([10, 32]);
}, 60_000);

nativeTest("generated allocated layouts typecheck warning-free for iOS", async () => {
  const result = await convertHtml(html, { name: "Allocated", css, viewport: { width: 390, height: 1200 } });
  const directory = await mkdtemp(join(tmpdir(), "markswift-allocated-ios-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(result.layout, { name: "Allocated", mode });
      for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
      for (const defaultIsolationMainActor of [false, true]) {
        const check = await typecheck(directory, { ...TYPECHECK_TARGET, defaultIsolationMainActor });
        expect(check.ok, check.output).toBe(true);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120_000);
