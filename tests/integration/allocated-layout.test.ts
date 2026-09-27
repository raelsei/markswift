import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { SemNode, GridNode, StackNode } from "../../src/model/semantic.ts";
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
#fixedrows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:110px}`;
const content = (count: number) => "M".repeat(count);
const html = `<main data-markswift-root>${["grow", "paddedgrow", "basis", "shrink", "partial", "grid", "minimum", "fixedrows"].map(id =>
  `<section id="${id}">${[32, 44, ...(id === "basis" ? [] : [52])].map(count => `<article>${content(count)}</article>`).join("")}</section>`).join("")}</main>`;

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
      const parameters = tracks.map(track => `MarkswiftAllocationTrack(basis: ${track.basis}, grow: ${track.grow}, shrink: ${track.shrink}, min: ${track.min}, max: ${track.max ?? "nil"}, inset: ${track.inset ?? 0})`).join(",");
      const probes = node.children.map(child => {
        const text = child.kind === "text" ? child.runs.map(run => run.text).join("") : "";
        const inset = child.padding[1] + child.padding[3], verticalInset = child.padding[0] + child.padding[2];
        return `NativeProbe(text: ${JSON.stringify(text)}, inset: ${inset}, verticalInset: ${verticalInset}, fixedHeight: ${child.height.kind === "fixed" ? child.height.px : "nil"})`;
      }).join(",");
      return `run(MarkswiftAllocatedLayout(tracks: [${parameters}], columnGap: ${node.kind === "grid" ? node.hSpacing : node.spacing}, rowGap: ${node.kind === "grid" ? node.vSpacing : 0}, grid: ${node.kind === "grid"}, stretch: true, capturedWidth: ${node.frame.w - node.padding[1] - node.padding[3]}), ${width}, [${probes}])`;
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
func run(_ layout: MarkswiftAllocatedLayout, _ width: CGFloat, _ subviews: [NativeProbe]) {
  var cache = (); let proposal = ProposedViewSize(width: width, height: nil)
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

async function capturesAtBothWidths() {
  const captures = [];
  for (const width of [390, 320]) captures.push(await convertHtml(html, { name: "Allocated", css, viewport: { width, height: 1200 } }));
  const roots = captures.map(result => inferScreen(result.layout, "Allocated").root);
  const ids = ["grow", "paddedgrow", "basis", "shrink", "partial", "grid", "minimum", "fixedrows"];
  const cases = [390, 320].flatMap(width => ids.map(id => ({ width: width - 32, node: find(roots[0]!, id) })));
  return { captures, roots, ids, cases };
}
let sharedCaptures: ReturnType<typeof capturesAtBothWidths> | undefined;
function proofCaptures() { return sharedCaptures ??= capturesAtBothWidths(); }

browserTest("one capture retains CSS allocation rules for unequal flex and fractions at 320 and 390", async () => {
  const { captures, roots, ids, cases } = await proofCaptures();
  cases.forEach(({ width, node }, index) => {
    const tracks = node.kind === "grid" ? node.tracks : node.allocation?.tracks;
    expect(tracks).toBeDefined();
    const browser = find(roots[Math.floor(index / ids.length)]!, ids[index % ids.length]!);
    const gap = node.kind === "grid" ? node.hSpacing : node.spacing as number;
    const available = width - (tracks!.length - 1) * gap;
    const allocated = node.kind === "grid" ? gridAllocatedWidths(available, tracks!) : flexAllocatedWidths(available, tracks!);
    let x = 0;
    browser.children.forEach((child, i) => {
      if (node.kind === "grid" && i % node.columns === 0) x = 0;
      const column = node.kind === "grid" ? i % node.columns : i;
      expect(allocated[column]!).toBeCloseTo(child.frame.w, 1);
      expect(x).toBeCloseTo(child.frame.x - browser.frame.x, 1);
      x += allocated[column]! + gap;
    });
  });
  expect(find(roots[1]!, "basis").frame.h).toBeGreaterThan(find(roots[0]!, "basis").frame.h);
  for (const mode of ["app", "fidelity"] as const) {
    const bundle = compileLayout(captures[0]!.layout, { name: "Allocated", mode });
    expect(bundle.code.includes("MarkswiftAllocatedLayout(")).toBe(mode === "app");
  }
}, 60_000);

nativeTest("emitted native allocation and text measurement agree with both browser widths", async () => {
  const { roots, ids, cases } = await proofCaptures();
  for (const { node } of cases) expect(node.kind === "grid" ? node.tracks : node.allocation?.tracks).toBeDefined();
  const native = await executeNative(cases);
  cases.forEach(({ node }, index) => {
    const browser = find(roots[Math.floor(index / ids.length)]!, ids[index % ids.length]!);
    const measured = native[index]!;
    expect(measured.height, `${node.id} at ${index < ids.length ? 390 : 320}`).toBeCloseTo(browser.frame.h, 1);
    browser.children.forEach((child, i) => {
      expect(measured.frames[i]!.x).toBeCloseTo(child.frame.x - browser.frame.x, 1);
      expect(measured.frames[i]!.w).toBeCloseTo(child.frame.w, 1);
      expect(measured.frames[i]!.h).toBeCloseTo(child.frame.h, 1);
    });
  });
}, 60_000);

browserTest("intrinsic tracks, spans, percentages and dense flow stay captured", async () => {
  for (const change of ["#grid{grid-template-columns:min-content 1fr 2fr}", "#grid article:first-child{grid-column:span 2}", "#basis article:first-child{flex-basis:30%}", "#grid{grid-auto-flow:dense}", "#grid{min-height:600px}"]) {
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

browserTest("unproved shrink-only percentage allocation stays diagnosed and captured", async () => {
  const markup = `<main data-markswift-root><section id="basis"><article>A</article><article>B</article></section></main>`;
  const style = css + `main{padding:0}#basis article:nth-child(n){flex:0 1 50%}`;
  const captures = [];
  for (const width of [390, 320]) captures.push(await convertHtml(markup, { name: "PercentageShrink", css: style, viewport: { width, height: 400 } }));
  const nodes = captures.map(capture => find(inferScreen(capture.layout, "PercentageShrink").root, "basis") as StackNode);
  expect(nodes[0]!.allocation).toBeUndefined();
  expect(nodes[0]!.measured).toBeDefined();
  expect(nodes[0]!.notes.join(" ")).toContain("percentage flex-basis");
  expect(nodes.map(node => node.children[0]!.frame.w)).toEqual([189, 154]);
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
