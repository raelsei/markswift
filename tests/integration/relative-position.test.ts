import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { flowFrame } from "../../src/analysis/relative-position.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { SemNode, StackNode } from "../../src/model/semantic.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { RELATIVE_GEOMETRY_FIXTURE, HANGING_RELATIVE_FIXTURE } from "../../tools/verify/relative-height-fixture.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const { html, css } = RELATIVE_GEOMETRY_FIXTURE;

function find(node: SemNode, id: string): SemNode {
  if (node.id === `#${id}`) return node;
  for (const child of "children" in node ? node.children : []) { try { return find(child, id); } catch { /* next */ } }
  throw new Error(`Missing ${id}`);
}
function layoutFind(node: LayoutNode, id: string): LayoutNode {
  if (node.id === `#${id}`) return node;
  for (const child of node.children) { try { return layoutFind(child, id); } catch { /* next */ } }
  throw new Error(`Missing capture ${id}`);
}

browserTest("authored relative offsets preserve flow slots, nested paint and allocation at three widths", async () => {
  for (const width of [390, 320, 500]) {
    const result = await convertHtml(html, { css, viewport: { width, height: 400 } });
    const root = inferScreen(result.layout, "Relative").root;
    expect(layoutFind(result.layout.root, "shifted").preferredSize?.relativeInsets).toEqual(["8px", "auto", "auto", "12px"]);
    const shifted = find(root, "shifted"), nested = find(root, "nested"), following = find(root, "following");
    expect(shifted.relativeOffset).toEqual([12, 8]); expect(nested.relativeOffset).toEqual([-5, -3]);
    expect(flowFrame(shifted).x).toBe(16); expect(flowFrame(shifted).y).toBe(16);
    expect(nested.frame.x).toBe(27); expect(nested.frame.y).toBe(25);
    expect(following.frame.y).toBe(60); expect(following.relativeOffset).toBeUndefined();
    const flex = find(root, "flex") as StackNode;
    expect(flex.allocation, flex.notes.join(";")).toBeDefined();
    expect(flex.measured!.frames[0]!.x).toBe(0); expect(flex.measured!.frames[0]!.y).toBe(0);
    const grid = find(root, "grid");
    expect(grid.kind === "grid" && grid.tracks).toBeTruthy();
    expect(find(root, "both-rtl").relativeOffset).toEqual([-20, 3]);
    expect(find(root, "both-ltr").relativeOffset).toEqual([10, 3]);
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(result.layout, { name: "Relative", mode });
      expect(bundle.code).toContain(".offset(x: 12.0, y: 8.0)");
      expect(bundle.code).toContain(".offset(x: -5.0, y: -3.0)");
    }
  }
}, 30_000);

browserTest("percentage relative offsets keep actual paint with a specific captured fallback", async () => {
  const capture = await convertHtml(html, { css: css + `#shifted{left:10%;top:20%}`, viewport: { width: 390, height: 400 } });
  const source = layoutFind(capture.layout.root, "shifted");
  expect(source.styles.left).not.toBe("10%");
  expect(source.preferredSize?.relativeInsets).toEqual(["20%", "auto", "auto", "10%"]);
  const root = inferScreen(capture.layout, "RelativeFallback").root;
  expect(find(root, "shifted").relativeOffset).toBeUndefined();
  expect(find(root, "shifted").notes.join(";")).toContain("percentage or complex relative inset");
  expect(root.kind === "stack" && root.measured).toBeTruthy();
  const serialized = JSON.parse(JSON.stringify(capture.layout));
  expect(compileLayout(serialized, { name: "Serialized" }).code).toContain("MarkswiftMeasuredLayout");
}, 30_000);

browserTest("a relative scroll viewport applies its own shift once around its content", async () => {
  const capture = await convertHtml(`<main data-markswift-root><section style="height:40px;overflow:auto;position:relative;left:12px;top:8px"><div style="height:80px"></div></section></main>`,
    { css: "body{margin:0}main{width:100%}", viewport: { width: 390, height: 100 } });
  const app = compileLayout(capture.layout, { name: "RelativeScroll", mode: "app" });
  expect(app.code).toContain("ScrollView(.vertical");
  expect(app.code.match(/\.offset\(x: 12\.0, y: 8\.0\)/g)).toHaveLength(1);
}, 30_000);

browserTest("negative-margin hanging overlays apply a relative paint shift exactly once", async () => {
  const fixture = HANGING_RELATIVE_FIXTURE;
  const capture = await convertHtml(fixture.html, { css: fixture.css, viewport: { width: 390, height: fixture.height } });
  const child = layoutFind(capture.layout.root, "hanging-child");
  expect(child.bounds.x).toBe(15);
  const root = inferScreen(capture.layout, "HangingRelative").root;
  const overlay = root.overlays.find(value => value.node.id === "#hanging-child");
  expect(overlay).toBeDefined();
  expect(overlay!.offset).toEqual([10, 0]);
  expect(overlay!.node.relativeOffset).toEqual([5, 0]);
  for (const mode of ["app", "fidelity"] as const) {
    const code = compileLayout(capture.layout, { name: "HangingRelative", mode }).code;
    expect(code).toContain(".offset(x: 10.0, y: 0.0)");
    expect(code.match(/\.offset\(x: 5\.0, y: 0\.0\)/g)).toHaveLength(1);
    expect(code).not.toContain(".offset(x: 15.0, y: 0.0)");
  }
}, 30_000);

nativeTest("relative flow and paint offsets compile in app/fidelity and default MainActor isolation", async () => {
  const capture = await convertHtml(html, { css, viewport: { width: 390, height: 400 } });
  const directory = await mkdtemp(join(tmpdir(), "markswift-relative-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const bundle = compileLayout(capture.layout, { name: "RelativeProbe", mode, geometryInstrumentation: true });
      for (const [path, source] of Object.entries(bundle.files)) await writeFile(join(directory, path), source);
      const checked = await typecheck(directory, { ...TYPECHECK_TARGET, defaultIsolationMainActor: true });
      expect(checked.ok, checked.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60_000);
