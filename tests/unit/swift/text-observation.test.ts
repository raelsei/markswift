import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";
import { emittedRunProjection, textInstrumentation, textObservationAlias, registerTextEmission } from "../../../src/swift/text-observation.ts";
import { textSourceProjection } from "../../../src/analysis/text-provenance.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { TextNode } from "../../../src/model/semantic.ts";

const raw = "Save now";
const source = { key: "dom:/0", kind: "text" as const, raw, ancestors: [], origin: "dom" as const, join: "verified" as const, layoutPresent: true };
const doc: LayoutDoc = { version: 1, source: "caption.html", combo: { screen: "caption", theme: "light", demoState: "normal" }, size: { w: 200, h: 40 }, dpr: 2, canvas: "white",
  root: { id: "#caption", tag: "button", attrs: {}, styles: { display: "inline-block", color: "rgb(0,0,0)", "font-family": "system-ui", "font-size": "16px", "line-height": "20px" }, bounds: { x: 0, y: 0, w: 100, h: 40 },
    textSourceCapture: { version: 1, trust: "converter-capture-claim", root: { key: "dom:/", type: 1, tag: "button", externalAncestors: [] }, occurrences: [source], unavailable: [] },
    children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 80, h: 20 }, text: raw, textSource: source, children: [] }] } };

test("opt-in source attributes and passive observer bind actual emitted caption occurrences only", () => {
  const plain = compileLayout(doc, { name: "Caption", mode: "fidelity" });
  const observed = compileLayout(doc, { name: "Caption", mode: "fidelity", textInstrumentation: true });
  expect(plain.text).toBeUndefined();
  expect(plain.files["MarkswiftTextObservation.swift"]).toBeUndefined();
  expect(plain.code).not.toContain("markswiftTextSource");
  const legacy = structuredClone(doc);
  delete legacy.root.textSourceCapture;
  delete legacy.root.children[0]!.textSource;
  expect(compileLayout(legacy, { name: "Caption", mode: "fidelity" }).files).toEqual(plain.files);
  expect(observed.code).toContain(".markswiftTextSource(");
  expect(observed.code).toContain(".markswiftObserveText(");
  expect(observed.files["MarkswiftTextObservation.swift"]).toContain("ctx.draw(line)");
  expect(observed.text?.capture?.trust).toBe("converter-capture-claim");
  expect(observed.text?.emissions.map(entry => entry.value)).toEqual(["Save now"]);
  expect(observed.text?.emissions[0]!.source?.units[0]!.sources[0]!.occurrence).toBe("dom:/0");
  expect(observed.text?.emissions[0]!.fontBinding).toBe("emission-specified-swiftui-font; resolved-font-unavailable");
});

test("fidelity-inserted breaks classify consumed source space separately from original hard breaks", () => {
  const text = "Save now", node = doc.root.children[0]!;
  const mapped = textSourceProjection(node, text, [...text].map((_, i) => i), "preserve")!;
  const run = { text, source: mapped, breaks: [5], font: { family: { kind: "system" as const, design: "default" as const }, size: 16, weight: 400 }, color: { r: 0, g: 0, b: 0, a: 1 } };
  const projected = emittedRunProjection(run, "fidelity");
  expect(projected.value).toBe("Save\nnow");
  expect(projected.source?.excluded.some(entry => entry.sources.some(source => source.start === 4 && source.end === 5))).toBe(true);
  expect(projected.source?.units.find(entry => entry.boundary)?.boundary).toMatchObject({ kind: "fidelity-inserted", owner: null });
  expect(projected.unavailable.join(" ")).toContain("hard-line native index scope");
});

test("observer serialization retains every draw and actual relative scopes without global source offset claims", () => {
  const observed = compileLayout(doc, { name: "Caption", textInstrumentation: true });
  const runtime = observed.files["MarkswiftTextObservation.swift"]!;
  expect(runtime).toContain("run-first-relative-unproven");
  expect(runtime).toContain("layout-line-local");
  expect(runtime).toContain('frameCoordinateSpace = "observed-root-local"');
  expect(runtime).toContain('drawCoordinateSpace = "text-layout-local; root mapping unproved"');
  expect(runtime).not.toContain('var coordinateSpace = "observed-root-local"');
  expect(runtime).not.toContain("removeAll");
  expect(runtime).not.toContain("layout.first?.first?.characterIndices.first");
});

test("decorated text preserves the ordinary renderer and declares absent draw coverage", () => {
  for (const decoration of ["underline", "line-through", "underline line-through"]) for (const mode of ["app", "fidelity"] as const) {
    const decorated = structuredClone(doc);
    decorated.root.styles["text-decoration-line"] = decoration;
    const observed = compileLayout(decorated, { name: "Decorated", mode, textInstrumentation: true });
    expect(observed.code).toContain("recordDraws: false");
    expect(observed.code).toContain(".markswiftTextSource(");
    expect(observed.text!.emissions.every(emission => emission.unavailable.some(reason => reason.includes("ordinary SwiftUI renderer")))).toBe(true);
  }
  const observed = compileLayout(doc, { name: "Plain", textInstrumentation: true });
  expect(observed.code).not.toContain("recordDraws: false");
  expect(observed.text!.emissions.every(emission => emission.unavailable.every(reason => !reason.includes("ordinary SwiftUI renderer")))).toBe(true);
});

test("explicit clone association rejects conflicting ownership and duplicate actual emission", () => {
  const screen = inferScreen(doc, "alias"), root = screen.root;
  const original = (root.kind === "control" ? root.content[0] : root) as TextNode;
  expect(original.kind).toBe("text");
  const state = textInstrumentation(root, "Alias"), clone = { ...original };
  textObservationAlias(clone, original, state);
  expect(state.keys.get(clone)).toBe(state.keys.get(original));
  registerTextEmission(clone, clone.runs[0]!, 0, "app", state);
  expect(() => registerTextEmission(original, original.runs[0]!, 0, "app", state)).toThrow("Duplicate text emission occurrence");
  expect(() => textObservationAlias(clone, root, state)).toThrow("Conflicting");
  expect(() => textObservationAlias({ ...original, runs: [...original.runs] }, original, state)).toThrow("unchanged original run ownership");
});
