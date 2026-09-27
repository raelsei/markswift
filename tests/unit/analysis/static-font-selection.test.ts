import { expect, test } from "bun:test";
import { selectStaticFontFace } from "../../../src/analysis/static-font-selection.ts";
import { fontOf, fontSelectionDiagnostic } from "../../../src/analysis/typography.ts";
import { fontWeight } from "../../../src/css/typography.ts";
import { fontExpr } from "../../../src/swift/format.ts";
import type { BundledFontFace } from "../../../src/model/fonts.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { TextNode, ControlNode } from "../../../src/model/semantic.ts";
import { textLineBoxFixture } from "../../helpers/text-line-box-fixture.ts";

const source = { "font-family": "Captured", "font-size": "18px", "font-weight": "500", "font-style": "normal", "font-stretch": "100%", "font-synthesis": "none" };
const face = (weight: number, name = `PublicFace${weight}`): BundledFontFace => ({ weight: [weight, weight], style: "normal", axes: {}, postScriptName: name, assetHash: "a".repeat(64) });
const faces = [face(400), face(700)];
const selection = (weight: number, catalog = faces, styles = source) => selectStaticFontFace(weight, catalog, styles);

test("CSS font matching preserves the special 400–500 search order and fractions", () => {
  for (const [requested, matched] of [[400, 400], [450, 400], [500, 400], [500.01, 700], [550, 700], [700, 700]] as const) {
    expect(selection(requested!)).toMatchObject({ kind: "static", matchedWeight: matched });
  }
  const complete = [100, 300, 400, 450, 500, 600, 900].map(w => face(w));
  for (const [requested, matched] of [[250, 100], [350, 300], [425, 450], [475, 500], [550, 600], [950, 900]] as const) {
    expect(selection(requested!, complete)).toMatchObject({ kind: "static", matchedWeight: matched });
  }
  expect(selection(450, [face(300), face(600)])).toMatchObject({ matchedWeight: 300 });
});

test("ANY variable axis retains the existing non-quantized route", () => {
  const variableAxes: Record<string, [number, number]>[] = [{ wght: [100, 900] }, { opsz: [8, 72] }, { wdth: [75, 100] }];
  for (const axes of variableAxes) {
    const catalog: BundledFontFace[] = [face(400), { ...face(700), style: "italic", axes }];
    expect(selection(650.25, catalog)).toMatchObject({ kind: "variable" });
    const spec = fontOf({ ...source, "font-weight": "650.25" }, { Captured: { weight: [100, 900], opsz: [8, 72], faces: catalog } });
    expect(spec.weight).toBe(650.25);
    expect(spec.opsz).toBe(18);
    expect(spec.staticFace).toBeUndefined();
    expect(fontExpr(spec, { mode: "fidelity" })).toBe('.markswiftVariable("Captured", size: 18.0, weight: 650.25, opsz: 18.0)');
  }
});

test("missing, ambiguous, ranged or modified static sources decline without inventing defaults", () => {
  expect(selectStaticFontFace(500, undefined, source).kind).toBe("unavailable");
  for (const catalog of [[{ ...face(400), postScriptName: undefined }], [{ ...face(400), assetHash: "not-sha" }], [{ ...face(400), weight: [400, 700] as [number, number] }], [face(400), face(400, "OtherFace")]]) {
    expect(selection(500, catalog).kind).toBe("unavailable");
  }
  for (const property of ["font-style", "font-stretch", "font-synthesis"]) {
    expect(selection(500, faces, { ...source, [property]: "" }).kind).toBe("unavailable");
  }
  expect(selection(500, faces, { ...source, "font-stretch": "75%" }).kind).toBe("unavailable");
  expect(selection(500, faces, { ...source, "font-synthesis": "weight style" }).kind).toBe("unavailable");
  expect(selection(500, [face(400, "SamePublicName"), { ...face(700, "SamePublicName"), assetHash: "b".repeat(64) }])).toMatchObject({ kind: "unavailable", reason: "public source name has ambiguous packaged assets" });
  expect(selection(500, [face(400, "SamePublicName"), { ...face(700, "SamePublicName"), style: "italic", assetHash: "b".repeat(64) }]).kind).toBe("unavailable");
  // Public JavaScript callers can supply legacy/malformed metadata outside TS's catalog type.
  for (const axes of [undefined, null, [], "unknown", new Map(), new Date(), { wght: null }]) {
    const malformed = { ...face(400), axes } as unknown as BundledFontFace;
    expect(selection(500, [malformed])).toMatchObject({ kind: "unavailable", reason: "packaged source axis state is unknown" });
  }
});

test("computed weight reaches the source selector; app expressions remain identical", () => {
  const families = { Captured: { weight: [400, 700] as [number, number], faces } };
  for (const [value, matched] of [["500", 400], ["500.01", 700]] as const) {
    const spec = fontOf({ ...source, "font-weight": value! }, families);
    expect(spec.weight).toBe(Number(value));
    expect(spec.staticFace).toEqual({ postScriptName: `PublicFace${matched}`, matchedWeight: matched, assetHash: "a".repeat(64) });
    expect(fontExpr(spec, { mode: "fidelity" })).toContain(`staticFace: "PublicFace${matched}"`);
    const { staticFace: _metadata, ...legacy } = spec;
    expect(fontExpr(spec, { mode: "app" })).toBe(fontExpr(legacy, { mode: "app" }));
  }
  expect(fontWeight("650.125")).toBe(650.125);
  expect(fontWeight("bold")).toBe(700);
  expect(fontWeight(undefined)).toBe(400);
  expect(fontSelectionDiagnostic(source, { Captured: { weight: [400, 700] } })).toContain("CSS face identity unavailable");
  expect(fontSelectionDiagnostic(source, families)).toContain("app");
  for (const weight of ["", "unknown", "400px"]) {
    const styles = { ...source, "font-weight": weight };
    expect(fontOf(styles, families).staticFace).toBeUndefined();
    expect(fontSelectionDiagnostic(styles, families)).toContain("requested CSS weight is unavailable");
  }
});

test("collapsed inline runs and controls retain explicit static-face provenance diagnostics", () => {
  const layout = textLineBoxFixture();
  layout.root.styles = { ...layout.root.styles, ...source, "font-weight": "400" };
  const text = layout.root.children[0]!;
  layout.root.children = [{ tag: "span", attrs: {}, styles: { ...layout.root.styles, display: "inline", "font-weight": "500.01" }, bounds: text.bounds, children: [text] }];
  const families = { Captured: { weight: [400, 700] as [number, number], faces } };
  const screen = inferScreen(layout, "InlineFace", { bundledFamilies: families });
  expect((screen.root as TextNode).runs[0]!.font.staticFace?.matchedWeight).toBe(700);
  expect(screen.root.notes.some(note => note.includes("app Dynamic Type"))).toBe(true);
  layout.root.tag = "button";
  const control = inferScreen(layout, "ControlFace", { bundledFamilies: families }).root as ControlNode;
  expect(control.kind).toBe("control");
  expect((control.content[0] as TextNode).runs[0]!.font.staticFace?.matchedWeight).toBe(700);
  expect(control.notes.some(note => note.includes("app Dynamic Type"))).toBe(true);
  layout.root.tag = "input"; layout.root.attrs = { type: "text" }; layout.root.children = [];
  const field = inferScreen(layout, "FieldFace", { bundledFamilies: families }).root as ControlNode;
  expect(field.font?.staticFace?.matchedWeight).toBe(400);
  expect(field.notes.some(note => note.includes("app Dynamic Type"))).toBe(true);
});
