import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayouts, compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import { FIELDSET_RUNTIME } from "../../../src/swift/fieldset-runtime.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

function layout(relative = false, radius = false): LayoutDoc {
  const fieldset = {
    id: "#fieldset", tag: "fieldset", attrs: {}, styles: { display: "block", "background-color": "rgba(30, 60, 90, 0.5)" } as Record<string, string>,
    bounds: { x: 0, y: 0, w: 240, h: 100 }, children: [
      { id: "#legend", tag: "legend", attrs: {}, styles: { display: "block", "font-family": "system-ui", "font-size": "14px", "line-height": "20px", ...(relative ? { position: "relative" } : {}) },
        preferredSize: relative ? { width: "auto", height: "auto", relativeInsets: ["4px", "auto", "auto", "7px"] as [string, string, string, string] } : undefined,
        bounds: { x: relative ? 19 : 12, y: relative ? 4 : 0, w: 70, h: 20 }, children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: relative ? 19 : 12, y: relative ? 5 : 1, w: 70, h: 17 }, text: "Caption", firstBaseline: relative ? 19 : 15, children: [] }] },
      { id: "#body", tag: "div", attrs: {}, styles: { display: "block" }, bounds: { x: 12, y: 32, w: 216, h: 40 }, children: [] },
    ],
  };
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(fieldset.styles, { [`border-${edge}-width`]: "2px", [`border-${edge}-style`]: "solid", [`border-${edge}-color`]: "rgb(10, 30, 50)" });
  if (radius) for (const corner of ["top-left", "top-right", "bottom-right", "bottom-left"]) fieldset.styles[`border-${corner}-radius`] = "8px";
  return { version: 1, source: "fieldset.html", combo: { screen: "fieldset", theme: "light", demoState: "normal" }, size: { w: 240, h: 100 }, dpr: 2, canvas: "transparent", fonts: [], root: fieldset };
}

test("fieldset emits separate contracted fill/border and live legend anchors before relative paint", () => {
  for (const mode of ["app", "fidelity"] as const) {
    const result = compileLayout(layout(true), { name: "FieldsetCaption", mode });
    expect(result.code).toContain(".modifier(MarkswiftFieldsetBackground(");
    expect(result.code).toContain(".modifier(MarkswiftFieldsetBorder(");
    expect(result.code).toContain('.markswiftFieldsetLegend("fieldset:root", relativeX: 7.0, relativeY: 4.0)');
    expect(result.code.indexOf(".markswiftFieldsetLegend(")).toBeLessThan(result.code.indexOf(".offset(x: 7.0, y: 4.0)"));
    expect(result.code).not.toContain("legendWidth:");
    expect(result.code).not.toContain("legendHeight:");
  }
  expect(FIELDSET_RUNTIME).toContain("proxy[anchor.bounds].offsetBy(dx: -anchor.relative.width");
  expect(FIELDSET_RUNTIME).toContain("FillStyle(eoFill: true)");
  expect(FIELDSET_RUNTIME).toContain(".allowsHitTesting(false).accessibilityHidden(true)");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("actual Swift fieldset geometry and transparent mask exclude only the static legend hole", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-fieldset-equations-"));
  try {
    await writeFile(join(directory, "Runtime.swift"), "import SwiftUI\nimport Foundation\n" + FIELDSET_RUNTIME);
    await writeFile(join(directory, "main.swift"), `import SwiftUI
import Foundation
let a = MarkswiftFieldsetGeometry(size: CGSize(width: 240, height: 100), legend: CGRect(x: 31, y: -900, width: 53, height: 36), borderWidth: 4)
precondition(a.decoration == CGRect(x: 0, y: 16, width: 240, height: 84))
precondition(a.cutout == CGRect(x: 31, y: 0, width: 53, height: 36))
let b = MarkswiftFieldsetGeometry(size: CGSize(width: 240, height: 100), legend: CGRect(x: 31, y: 900, width: 53, height: 2), borderWidth: 8)
precondition(b.decoration == CGRect(x: 0, y: 0, width: 240, height: 100))
precondition(b.cutout.height == 8)
let c = MarkswiftFieldsetGeometry(size: CGSize(width: 100, height: 10), legend: CGRect(x: 5, y: 0, width: 20, height: 80), borderWidth: 0)
precondition(c.decoration.height == 0)
let mask = MarkswiftFieldsetBorderMask(cutout: a.cutout).path(in: CGRect(x: 0, y: 0, width: 240, height: 100))
precondition(!mask.contains(CGPoint(x: 50, y: 18), eoFill: true))
precondition(mask.contains(CGPoint(x: 10, y: 18), eoFill: true))
precondition(mask.contains(CGPoint(x: 50, y: 90), eoFill: true))
print("actual Swift equations and transparent mask passed")
`);
    const built = await Bun.$`xcrun swiftc -swift-version 6 -strict-concurrency=complete ${join(directory, "Runtime.swift")} ${join(directory, "main.swift")} -o ${join(directory, "proof")}`.quiet().nothrow();
    expect(built.exitCode, built.stderr.toString()).toBe(0);
    expect(built.stderr.toString()).not.toContain("warning:");
    const ran = await Bun.$`${join(directory, "proof")}`.quiet().nothrow();
    expect(ran.exitCode, ran.stderr.toString()).toBe(0);
    expect(ran.stdout.toString()).toContain("transparent mask passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

nativeTest("complete app/fidelity fieldsets compile with rectangle and rounded decoration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-fieldset-sdk-"));
  try {
    const inputs = ["app", "fidelity"].flatMap(mode => [false, true].flatMap(relative => [false, true].map(radius => ({ layout: layout(relative, radius), name: `Fieldset${mode}${relative ? "Relative" : "Static"}${radius ? "Rounded" : "Square"}`, mode: mode as "app" | "fidelity" }))));
    const batch = compileLayouts(inputs);
    for (const [name, contents] of Object.entries(batch.files)) await writeFile(join(directory, name), contents);
    const result = await typecheck(directory);
    expect(result.ok, result.output).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
