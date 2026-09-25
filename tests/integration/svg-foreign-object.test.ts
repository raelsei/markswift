import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

function findTag(node: LayoutNode, tag: string): LayoutNode | undefined {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findTag(child, tag);
    if (found) return found;
  }
  return undefined;
}

browserTest("SVG foreignObject HTML is never silently omitted", async () => {
  const result = await convertHtml(`<svg id="graphic" data-markswift-root width="180" height="80" viewBox="0 0 180 80">
    <rect width="180" height="80" fill="navy"/>
    <foreignObject x="10" y="10" width="150" height="50">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:16px Arial">Foreign visible</div>
    </foreignObject>
  </svg>`, { name: "ForeignObject" });

  expect(findTag(result.layout.root, "foreignobject")).toBeDefined();
  expect(JSON.stringify(result.layout.root)).toContain("Foreign visible");
  const svg = result.diagnostics.find((item) => item.id === "#graphic");
  expect(svg).toBeDefined();
  expect(svg!.confidence).toBe("unmapped");
  expect(svg!.notes.some((note) => note.includes("<foreignObject>") && note.includes("Foreign visible"))).toBe(true);
  expect(result.mapping.unmapped).toBeGreaterThanOrEqual(1);
  expect(result.code).toContain("MarkswiftShape_");
}, 30_000);
