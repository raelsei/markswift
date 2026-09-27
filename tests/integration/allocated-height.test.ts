import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { SemNode, StackNode } from "../../src/model/semantic.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { ALLOCATED_MARGIN_FIXTURE } from "../../tools/verify/relative-height-fixture.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const fixture = async () => ({ html: await readFile("tools/verify/fixtures/allocation.html", "utf8"),
  css: await readFile("tools/verify/fixtures/allocation.css", "utf8") });
function texts(node: SemNode): SemNode[] {
  return node.kind === "text" ? [node] : "children" in node ? node.children.flatMap(texts) : [];
}

browserTest("authored fixed-height allocated panels retain CSS insets and natural baselines after wrapping", async () => {
  const { html, css } = await fixture();
  for (const width of [390, 320, 500]) {
    const capture = await convertHtml(html, { css, viewport: { width, height: 460 } });
    const root = inferScreen(capture.layout, "AllocationHeight").root;
    const panels = texts(root).filter(node => node.id !== "0");
    expect(panels).toHaveLength(12);
    for (const panel of panels) {
      expect(panel.frame.h).toBe(78);
      expect(panel.height).toEqual({ kind: "fixed", px: 78 });
      expect(panel.padding).toEqual([10, 10, 10, 10]);
      if (panel.kind !== "text") throw new Error("Expected panel text");
      expect(panel.lineBox).toMatchObject({ firstBaseline: 15, baselineToBottom: 5, baselineStep: 20 });
      expect(panel.frame.y + panel.padding[0] + panel.lineBox!.firstBaseline)
        .toBe(capture.layout.root.children.flatMap(row => row.children).find(node => node.id === panel.id)!.children[0]!.firstBaseline!);
    }
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(capture.layout, { name: "AllocationHeight", mode });
      expect(bundle.code.match(/\.frame\(height: 78\.0, alignment: \.topLeading\)/g)).toHaveLength(12);
      expect(bundle.code).not.toContain("bottom: 48.0");
      if (mode === "app") expect(bundle.code).toContain('MarkswiftGreedyText("Shrink twice"');
    }
  }
}, 30_000);

browserTest("auto-height flex items preserve their non-collapsing last child's bottom margin", async () => {
  const { html, css } = ALLOCATED_MARGIN_FIXTURE;
  for (const width of [390, 320, 500]) {
    const capture = await convertHtml(html, { css, viewport: { width, height: 400 } });
    const row = (inferScreen(capture.layout, "MarginHeight").root as StackNode).children[0] as StackNode;
    expect(row.allocation, row.notes.join(";")).toBeDefined();
    expect(row.height).toEqual({ kind: "hug" });
    expect(row.children.map(child => child.padding[2])).toEqual([22, 22]);
    expect(row.children.map(child => child.minHeight)).toEqual([0, 0]);
    expect(row.frame.h).toBeGreaterThanOrEqual(109);
    const bundle = compileLayout(capture.layout, { name: "MarginHeight" });
    expect(bundle.code).toContain("intrinsicHeight: true");
    expect(bundle.code).toContain("bottom: 22.0");
  }
}, 30_000);

nativeTest("fixed allocated text heights and baseline alignment compile in both modes", async () => {
  const { html, css } = await fixture();
  const capture = await convertHtml(html, { css, viewport: { width: 390, height: 460 } });
  const directory = await mkdtemp(join(tmpdir(), "markswift-fixed-height-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(capture.layout, { name: "AllocationHeight", mode });
      for (const [path, source] of Object.entries(bundle.files)) await writeFile(join(directory, path), source);
      const checked = await typecheck(directory, { ...TYPECHECK_TARGET, defaultIsolationMainActor: true });
      expect(checked.ok, checked.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60_000);
