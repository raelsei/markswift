import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { styleOf } from "../../src/analysis/style.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "capture retains percentage translation from stylesheet rules and leaves the DOM unchanged",
  async () => {
    const result = await convertHtml(
      `<style>#bar{transform:translateX(-38%)} #turn{transform:rotate(90deg) translateX(50%)}</style><main data-markswift-root style="width:200px"><div id="bar" style="height:20px;background:red"></div><div id="turn" style="height:20px;background:blue"></div></main>`,
      { theme: "light" },
    );
    expect(result.layout.root.children).toHaveLength(2);
    const [bar, turn] = result.layout.root.children;
    expect(bar!.preferredSize?.transformTranslation).toEqual({ x: [-0.38, 0], y: [0, 0] });
    expect(turn!.preferredSize?.transformTranslation?.y[0]).toBeCloseTo(0.5);
    expect(styleOf(bar!, []).transform?.responsive?.x[0]).toBe(-0.38);
    expect(result.code).toContain("MarkswiftResponsiveTranslation");
  },
  60_000,
);

browserTest(
  "percentage relative insets use actual percent-height and stretched containing blocks",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root style="width:300px;height:600px">
    <div style="height:200px"><div style="height:50%;position:relative;top:7px"><div id="percent" style="position:relative;top:10%;height:20px;background:red"></div></div></div>
    <div style="display:flex;height:200px"><div style="flex:1"><div id="flex" style="position:relative;top:10%;height:20px;background:red"></div></div></div>
    <div style="display:grid;height:200px"><div><div id="grid" style="position:relative;top:10%;height:20px;background:red"></div></div></div>
  </main>`,
      { theme: "light" },
    );
    const found = new Map<string, LayoutNode>();
    const walk = (n: LayoutNode) => {
      if (n.attrs.id) found.set(n.attrs.id, n);
      n.children.forEach(walk);
    };
    walk(result.layout.root);
    expect(found.get("percent")!.preferredSize?.relativeOffset).toEqual([0, 10]);
    expect(found.get("flex")!.preferredSize?.relativeOffset).toEqual([0, 20]);
    expect(found.get("grid")!.preferredSize?.relativeOffset).toEqual([0, 20]);
    expect(result.code).toContain(".offset(x: 0.0, y: 10.0)");
    expect(result.code).toContain(".offset(x: 0.0, y: 20.0)");
  },
  60_000,
);
