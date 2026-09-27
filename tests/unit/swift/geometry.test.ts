import { expect, test } from "bun:test";
import { compileLayout, compileLayouts, compileResponsiveLayouts, type LayoutDoc } from "../../../src/compiler/index.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { geometryInstrumentation } from "../../../src/swift/geometry-observation.ts";
import type { BoxNode, Screen, SemBase, StackNode } from "../../../src/model/semantic.ts";

function base(id: string): SemBase {
  return { id, frame: { x: 0, y: 0, w: 100, h: 40 }, width: { kind: "fixed", px: 100 }, height: { kind: "fixed", px: 40 },
    padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [] };
}
function box(id: string): BoxNode { return { ...base(id), kind: "box" }; }
function stack(id: string, children: StackNode["children"]): StackNode {
  return { ...base(id), kind: "stack", children, axis: "v", spacing: 0, align: "start", distribution: "start", leadInset: 0 };
}
function screen(root: Screen["root"]): Screen {
  return { version: 1, name: "geometry", source: "geometry.html", theme: "light", size: { w: 100, h: 40 }, canvas: { r: 1, g: 1, b: 1, a: 1 }, root };
}
const layout: LayoutDoc = { version: 1, source: "geometry.html", combo: { screen: "test", theme: "light", demoState: "normal" },
  size: { w: 100, h: 40 }, dpr: 1, canvas: "white", root: { tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 100, h: 40 }, children: [] } };

test("disabled geometry instrumentation preserves compiler output exactly and adds no helper", () => {
  for (const mode of ["app", "fidelity"] as const) {
    expect(compileLayout(layout, { mode, geometryInstrumentation: false })).toEqual(compileLayout(layout, { mode }));
    const disabled = compileLayout(layout, { mode });
    expect(disabled.geometry).toBeUndefined();
    expect(Object.keys(disabled.files)).toHaveLength(4);
    expect(disabled.code).not.toContain("markswiftObserveGeometry");
    const observed = compileLayout(layout, { mode, geometryInstrumentation: true });
    expect(observed.geometry?.nodes).toHaveLength(1);
    expect(observed.geometry?.nodes[0]?.instrumented).toBe(true);
    expect(observed.files["MarkswiftGeometry.swift"]).toContain("proxy[anchor.bounds]");
    for (const name of ["MarkswiftRuntime.swift", "MarkswiftTokens.swift", "MarkswiftShapes.swift"]) expect(observed.files[name]).toBe(disabled.files[name]);
    expect(observed.diagnostics).toEqual(disabled.diagnostics);
    expect(observed.mapping).toEqual(disabled.mapping);
  }
});

test("occurrence keys survive duplicate source ids and include labels, overlays, and scroll roles", () => {
  const scroll = stack("scroll", [box("duplicate"), box("duplicate")]); scroll.scroll = "v";
  const root = stack("root", [scroll, { ...base("button"), kind: "control", control: "button", label: box("label"), content: [box("content")] },
    { ...base("field"), kind: "control", control: "textField", content: [box("unused")] }]);
  root.overlays = [{ node: box("overlay"), layer: "overlay", offset: [0, 0], covers: false }];
  const result = emitSwift(screen(root), "Observed", { mode: "app", geometryInstrumentation: true });
  const manifest = result.geometry!;
  expect(new Set(manifest.nodes.map(node => node.key)).size).toBe(manifest.nodes.length);
  expect(manifest.nodes.filter(node => node.sourceId === "duplicate").map(node => node.key)).toEqual(["Observed/root/children/0/children/0", "Observed/root/children/0/children/1"]);
  expect(manifest.nodes.some(node => node.relation === "label")).toBe(true);
  expect(manifest.nodes.find(node => node.sourceId === "unused")?.instrumented).toBe(false);
  expect(manifest.nodes.find(node => node.role === "scroll-content")?.key).toBe("Observed/root/children/0");
  expect(manifest.nodes.find(node => node.role === "scroll-viewport")?.key).toBe("Observed/root/children/0/viewport");
  expect(manifest.nodes).not.toContainEqual(expect.objectContaining({ frame: expect.anything() }));
  expect(() => geometryInstrumentation(stack("root", [scroll, scroll]), "Bad")).toThrow("distinct semantic occurrences");
});

test("table clone content is suppressed while the allocated cell border is observed once", () => {
  const cell = box("cell");
  const root = stack("table", [cell]);
  root.table = { columns: [{ kind: "fixed", value: 100 }], placements: [{ kind: "cell", row: 0, column: 0, rowSpan: 1, columnSpan: 1 }], rowMinimums: [40], spacing: [0, 0], insets: [0, 0, 0, 0] };
  const result = emitSwift(screen(root), "TableProbe", { mode: "app", geometryInstrumentation: true });
  expect(result.view.match(/markswiftObserveGeometry\("TableProbe\/root\/children\/0"/g)).toHaveLength(1);
  expect(result.geometry!.nodes.find(node => node.sourceId === "cell")?.instrumented).toBe(true);
});

test("batch and responsive branch instrumentation has distinct namespaces and one optional runtime", () => {
  const batch = compileLayouts([{ name: "One", layout, geometryInstrumentation: true }, { name: "Two", layout, geometryInstrumentation: true }]);
  expect(batch.views.map(view => view.geometry!.namespace)).toEqual(["One", "Two"]);
  expect(Object.keys(batch.files).filter(path => path === "MarkswiftGeometry.swift")).toHaveLength(1);
  const options = { name: "Adaptive", breakpoint: 200, compact: { layout, viewportWidth: 100 }, regular: { layout, viewportWidth: 390 } };
  const observed = compileResponsiveLayouts({ ...options, geometryInstrumentation: true });
  expect(observed.views.map(view => view.geometry!.namespace)).toEqual(["AdaptiveCompact", "AdaptiveRegular"]);
  expect(compileResponsiveLayouts({ ...options, geometryInstrumentation: false })).toEqual(compileResponsiveLayouts(options));
});

test("content-height allocation owns cross-size limits while explicit and fill heights retain proposals", () => {
  const row = stack("row", [box("a"), box("b")]); row.axis = "h"; row.height = { kind: "hug" }; row.padding = [4, 0, 4, 0];
  row.minHeight = 100; row.maxHeight = 120;
  row.allocation = { tracks: [1, 1].map(grow => ({ basis: 0, min: 0, grow, shrink: 1 })) };
  const root = stack("root", [row]);
  const automatic = emitSwift(screen(root), "Intrinsic", { mode: "app" }).view;
  expect(automatic).toContain("intrinsicHeight: true, minimumHeight: 92.0, maximumHeight: 112.0");
  expect(automatic).not.toContain("minHeight: 100.0"); expect(automatic).not.toContain("maxHeight: 120.0");
  for (const height of [{ kind: "fixed", px: 80 }, { kind: "fill" }] as const) {
    row.height = height;
    const explicit = emitSwift(screen(root), "Explicit", { mode: "app" }).view;
    expect(explicit).not.toContain("intrinsicHeight: true");
    expect(explicit).toContain(height.kind === "fixed" ? "height: 80.0" : "maxHeight: 120.0");
  }
});

test("scroll viewport owns sizing and paint while flow content has an unconstrained scroll axis", () => {
  const scroll = stack("scroll", [box("a"), box("b")]); scroll.scroll = "v"; scroll.height = { kind: "fixed", px: 80 }; scroll.padding = [4, 4, 4, 4];
  scroll.style = { fills: [{ kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }], shadows: [] };
  const root = stack("root", [scroll]);
  const observed = emitSwift(screen(root), "Viewport", { mode: "app", geometryInstrumentation: true });
  const code = observed.view.slice(observed.view.indexOf("private var v_scroll"));
  const viewport = code.slice(code.indexOf('role: "scroll-content")'));
  expect(viewport).toMatch(/role: "scroll-content"\)\n\s*}\n\s*\.frame\(height: 80\.0/);
  expect(viewport.indexOf("height: 80.0")).toBeLessThan(viewport.indexOf(".background("));
  expect(observed.geometry!.nodes.filter(node => node.sourceId === "scroll").every(node => node.instrumented)).toBe(true);
  scroll.distribution = "center";
  const constrained = emitSwift(screen(root), "Constrained", { mode: "app" });
  expect(constrained.report.flatMap(node => node.notes).join(" ")).toContain("constrained scroll content retains captured extent");
});
