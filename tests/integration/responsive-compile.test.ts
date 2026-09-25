import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileResponsiveLayouts } from "../../src/compiler/index.ts";
import type { LayoutDoc } from "../../src/model/layout.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

function layout(width: number, theme: "light" | "dark" = "light"): LayoutDoc {
  return {
    version: 1, source: `card-${width}.html`, combo: { screen: "card", theme, demoState: "normal" },
    size: { w: width, h: 80 }, dpr: 1, canvas: "white", fonts: [],
    root: { id: "root", tag: "main", attrs: {}, styles: { display: "block", "background-color": "rgb(255, 0, 0)" }, bounds: { x: 0, y: 0, w: width, h: 80 }, children: [] },
  };
}

const options = {
  name: "CardView", breakpoint: 350,
  compact: { layout: layout(320), viewportWidth: 320 },
  regular: { layout: layout(390), viewportWidth: 390 },
};

test("responsive compiler emits two branches, one wrapper and one shared helper set", () => {
  const result = compileResponsiveLayouts(options);
  expect(result.name).toBe("CardView");
  expect(result.code).toBe(result.files["CardView.swift"]!);
  expect(result.views.map(view => view.name)).toEqual(["CardViewCompact", "CardViewRegular"]);
  expect(Object.keys(result.files).sort()).toEqual([
    "CardView.swift", "CardViewCompact.swift", "CardViewRegular.swift",
    "MarkswiftResponsiveLayout.swift", "MarkswiftRuntime.swift", "MarkswiftTokens.swift", "MarkswiftShapes.swift",
  ].sort());
  expect(result.code).toContain("MarkswiftResponsiveLayout(breakpoint: 350)");
  expect(result.code).toContain("CardViewCompact()");
  expect(result.code).toContain("CardViewRegular()");
  expect(result.files["MarkswiftResponsiveLayout.swift"]).toContain("ViewThatFits(in: .horizontal)");
  expect(result.files["MarkswiftResponsiveLayout.swift"]).toContain("breakpoint.nextUp");
  expect(result.files["MarkswiftResponsiveLayout.swift"]).not.toContain("GeometryReader");
});

test("responsive compiler rejects invalid thresholds, themes and wrapper collisions", () => {
  expect(() => compileResponsiveLayouts({ ...options, breakpoint: 319 })).toThrow("breakpoint");
  expect(() => compileResponsiveLayouts({ ...options, breakpoint: 390 })).toThrow("breakpoint");
  expect(() => compileResponsiveLayouts({ ...options, breakpoint: 350.5 })).toThrow("breakpoint");
  expect(() => compileResponsiveLayouts({ ...options, compact: { ...options.compact, viewportWidth: -1 } })).toThrow("viewportWidth");
  expect(() => compileResponsiveLayouts({ ...options, regular: { layout: layout(390, "dark"), viewportWidth: 390 } })).toThrow("theme");
  expect(() => compileResponsiveLayouts({ ...options, name: "Image" })).toThrow("name");
  expect(() => compileResponsiveLayouts({ ...options, supportFiles: { "CardView.swift": "conflict" } })).toThrow("collision");
  expect(() => compileResponsiveLayouts({ ...options, assets: { "CardView.swift/child": Uint8Array.of(1) } })).toThrow("collision");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("responsive wrapper and both generated branches typecheck in one iOS target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-responsive-swift-"));
  try {
    const bundle = compileResponsiveLayouts(options);
    for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
    const check = await typecheck(directory);
    expect(check.ok, check.output).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
