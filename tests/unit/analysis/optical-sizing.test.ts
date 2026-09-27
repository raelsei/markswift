import { expect, test } from "bun:test";
import { selectOpticalSize } from "../../../src/analysis/optical-sizing.ts";
import { fontOf, fontSelectionDiagnostic } from "../../../src/analysis/typography.ts";
import { fontExpr } from "../../../src/swift/format.ts";
import type { BundledFamily } from "../../../src/model/fonts.ts";

const styles = { "font-family": "Optical", "font-size": "32px", "font-weight": "650.25", "font-optical-sizing": "none", "font-variation-settings": "normal" };
const face = { style: "normal" as const, weight: [100, 900] as [number, number], axes: { opsz: [14, 72] as [number, number], wght: [100, 900] as [number, number] },
  axisDefaults: { opsz: 20, wght: 400 }, sourceVariations: ["normal"], postScriptName: "OpticalPublic", assetHash: "a".repeat(64) };
const family = { weight: [100, 900] as [number, number], opsz: [14, 72] as [number, number], faces: [face] };

test("captured optical none uses actual fvar default, never axis minimum or font size", () => {
  expect(selectOpticalSize(styles, family)).toEqual({ kind: "none", value: 20 });
  const spec = fontOf(styles, { Optical: family });
  expect(spec.opsz).toBe(20); expect(spec.weight).toBe(650.25); expect(spec.staticFace).toBeUndefined();
  expect(fontExpr(spec, { mode: "fidelity" })).toBe('.markswiftVariable("Optical", size: 32.0, weight: 650.25, opsz: 20.0)');
  expect(fontExpr(spec, { mode: "app" })).toBe(fontExpr({ ...spec, opsz: 32 }, { mode: "app" }));
  expect(fontSelectionDiagnostic(styles, { Optical: family })).toContain("app Dynamic Type");
  const auto = { ...styles, "font-optical-sizing": "auto" };
  expect(selectOpticalSize(auto, family)).toEqual({ kind: "auto" });
  expect(fontOf(auto, { Optical: family }).opsz).toBe(32);
  expect(fontOf({ ...auto, "font-size": "100px" }, { Optical: family }).opsz).toBe(72);
  expect(fontSelectionDiagnostic(auto, { Optical: family })).toBeUndefined();
});

test("source 16.16 defaults and supplied high-precision automatic coordinates survive Swift emission", () => {
  const precise = { ...family, faces: [{ ...face, axisDefaults: { opsz: 20.00390625, wght: 400 } }] };
  const spec = fontOf(styles, { Optical: precise });
  expect(spec.opsz).toBe(20.00390625);
  expect(fontExpr(spec, { mode: "fidelity" })).toContain("opsz: 20.00390625");
  // Ordinary font-size auto coordinates stay byte-identical. Higher precision caller-supplied
  // auto coordinates intentionally change from the old three-decimal rounding.
  expect(fontExpr({ ...spec, opsz: 32 }, { mode: "fidelity" })).toContain("opsz: 32.0");
  expect(fontExpr({ ...spec, opsz: 32.00001525878906 }, { mode: "fidelity" })).toContain("opsz: 32.00001525878906");
  expect(fontExpr({ ...spec, opsz: 32.00001525878906 }, { mode: "app" })).toBe(fontExpr(spec, { mode: "app" }));
});

test("optical source defaults/descriptors must remain known and unambiguous", () => {
  const badDefaults = [undefined, null, [], new Map(), { opsz: NaN, wght: 400 }, { opsz: 10, wght: 400 }, { opsz: 20 }, { opsz: 20, wght: 1001 }];
  for (const axisDefaults of badDefaults) expect(selectOpticalSize(styles, { ...family, faces: [{ ...face, axisDefaults }] } as unknown as BundledFamily).kind).toBe("unavailable");
  for (const sourceVariations of [undefined, [], [null], ["normal", null], ["normal", '"opsz" 24'], ['"opsz" 24']]) {
    expect(selectOpticalSize(styles, { ...family, faces: [{ ...face, sourceVariations }] } as unknown as BundledFamily).kind).toBe("unavailable");
  }
  expect(selectOpticalSize(styles, { ...family, faces: [face, { ...face, axisDefaults: { opsz: 24, wght: 400 } }] }).kind).toBe("unavailable");
  expect(selectOpticalSize(styles, { ...family, faces: [face, { ...face, axes: {} }] }).kind).toBe("unavailable");
  for (const invalid of [{ postScriptName: undefined }, { assetHash: "bad" }, { axes: null }]) {
    expect(selectOpticalSize(styles, { ...family, faces: [{ ...face, ...invalid }] } as unknown as BundledFamily).kind).toBe("unavailable");
  }
});

test("unknown optical state and explicit element/source variation settings retain diagnosed legacy output", () => {
  for (const changed of [{ "font-optical-sizing": "" }, { "font-optical-sizing": "unknown" }, { "font-variation-settings": "" }, { "font-variation-settings": '"opsz" 24' }]) {
    const input = { ...styles, ...changed };
    expect(selectOpticalSize(input, family).kind).toBe("unavailable");
    expect(fontOf(input, { Optical: family }).opsz).toBe(32);
    expect(fontSelectionDiagnostic(input, { Optical: family })).toContain("optical sizing");
  }
  expect(selectOpticalSize(styles, { ...family, faces: undefined }).kind).toBe("unavailable");
  expect(selectOpticalSize(styles, { weight: [100, 900] })).toEqual({ kind: "absent" });
  const conflicting = { ...family, faces: [{ ...face, sourceVariations: ["normal", '"opsz" 24'] }] };
  expect(fontOf(styles, { Optical: conflicting }).opsz).toBe(32);
  expect(fontSelectionDiagnostic(styles, { Optical: conflicting })).toContain("source variation descriptors");
  expect(fontOf({ ...styles, "font-optical-sizing": "auto" }, { Optical: conflicting }).opsz).toBe(32);
  expect(fontSelectionDiagnostic({ ...styles, "font-optical-sizing": "auto" }, { Optical: conflicting })).toContain("source variation descriptors");
});

test("concrete installed aliases acknowledge system-design substitution while generics remain unchanged", () => {
  for (const family of ["Arial", "Helvetica", "Helvetica Neue", "Times", "Times New Roman", "Menlo"]) {
    expect(fontSelectionDiagnostic({ ...styles, "font-family": family })).toContain("concrete");
  }
  for (const family of ["system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif", "serif", "ui-serif", "monospace"]) {
    expect(fontSelectionDiagnostic({ ...styles, "font-family": family })).toBeUndefined();
  }
});
