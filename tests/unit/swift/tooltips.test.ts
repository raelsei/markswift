/** D-HOVER: a tooltip is `.help` plus an accessibility hint in both modes; an author hint wins. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import type { EmitMode } from "../../../src/swift/context.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const FONT = { "font-family": "system-ui", "font-size": "17px", "line-height": "22px", color: "rgb(0, 0, 0)" };

function button(attrs: Record<string, string>, label: string, y: number): LayoutNode {
  return {
    tag: "button",
    attrs,
    styles: { ...FONT, display: "inline-block" },
    bounds: { x: 0, y, w: 80, h: 22 },
    children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y, w: 40, h: 22 }, text: label, children: [] }],
  };
}

const NOTE: LayoutNode = {
  tag: "p",
  id: "note",
  attrs: { id: "note" },
  styles: { ...FONT, display: "block" },
  bounds: { x: 0, y: 60, w: 200, h: 22 },
  children: [
    {
      tag: "#text",
      attrs: {},
      styles: {},
      bounds: { x: 0, y: 60, w: 120, h: 22 },
      text: "Saved locally",
      children: [],
    },
  ],
};

function emit(children: LayoutNode[], mode: EmitMode) {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "tooltips.html",
    combo: { screen: "tooltips", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 320, h: 400 },
      children,
    },
  };
  return emitSwift(inferScreen(doc, "Tooltips"), "TooltipsView", { mode, extract: false });
}

const PAGE = [
  button({ title: "Save draft" }, "Save", 0),
  button({ title: "Delete draft", "aria-describedby": "note" }, "Delete", 30),
  NOTE,
];

for (const mode of ["app", "fidelity"] as const)
  test(`${mode}: a title is .help and the hint; an aria-describedby hint wins`, () => {
    const view = emit(PAGE, mode).view;
    expect(view).toContain('.help("Save draft")');
    expect(view).toContain('.accessibilityHint("Save draft")');
    expect(view).toContain('.help("Delete draft")');
    expect(view).toContain('.accessibilityHint("Saved locally")');
    expect(view).not.toContain('.accessibilityHint("Delete draft")');
  });

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  ".help typechecks at iOS 18",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-tooltips-typecheck-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const out = emit(PAGE, mode);
        const dir = join(directory, mode);
        await Bun.write(join(dir, "TooltipsView.swift"), out.view);
        await Bun.write(join(dir, "MarkswiftRuntime.swift"), SWIFT_RUNTIME);
        for (const [name, source] of Object.entries(out.shapes)) await Bun.write(join(dir, `${name}.swift`), source);
        const check = await typecheck(dir);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
