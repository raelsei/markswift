import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "capture records the authored grid-template-columns and explicit grid-template-rows",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><div id="a" style="display:grid;grid-template-columns:1fr 2fr"><i>1</i><i>2</i></div><div id="b" style="display:grid;grid-template-columns:100px 100px;grid-template-rows:40px"><i>1</i><i>2</i></div></main>`,
      { theme: "light", viewport: { width: 390, height: 800 } },
    );
    const byId = new Map<string, LayoutNode>();
    const walk = (n: LayoutNode) => {
      if (n.attrs.id) byId.set(n.attrs.id, n);
      n.children.forEach(walk);
    };
    walk(result.layout.root);
    expect(byId.get("a")!.preferredSize?.gridTemplateColumns).toBe("1fr 2fr");
    expect(byId.get("a")!.preferredSize?.gridTemplateRows).toBeUndefined();
    expect(byId.get("b")!.preferredSize?.gridTemplateRows).toBe("40px");
  },
  30_000,
);
