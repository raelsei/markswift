import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { SemNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

function byAttrId(n: LayoutNode, id: string): LayoutNode | undefined {
  if (n.attrs.id === id) return n;
  for (const c of n.children) {
    const hit = byAttrId(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function bySemId(n: SemNode, id: string): SemNode | undefined {
  if (n.id === id) return n;
  for (const c of "children" in n && n.children ? n.children : []) {
    const hit = bySemId(c, id);
    if (hit) return hit;
  }
  return undefined;
}

browserTest("margin-left: auto is captured and becomes an auto gap", async () => {
  const result = await convertHtml('<main data-markswift-root><nav id="n" style="display:flex;width:300px;gap:8px"><a id="a">Home</a><a id="b" style="margin-left:auto">Login</a></nav></main>', { css: "html,body{margin:0}", viewport: { width: 390, height: 844 } });
  expect(byAttrId(result.layout.root, "b")?.preferredSize?.autoMargins).toEqual(["left"]);
  const nav = bySemId(inferScreen(result.layout, "t").root, byAttrId(result.layout.root, "n")!.id!);
  expect(nav?.kind === "stack" ? nav.autoGaps : undefined).toEqual([1]);
}, 60000);
