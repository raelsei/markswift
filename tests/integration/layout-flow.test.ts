import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { insetsOf } from "../../src/analysis/geometry.ts";
import { visit } from "../../src/swift/traversal.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { GridNode, SemNode, StackNode } from "../../src/model/semantic.ts";
import { FLOW_HTML, FLOW_CSS } from "../helpers/flow-fixture.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
for (const width of [320, 390, 768]) {
  for (const theme of ["light", "dark"] as const) {
    browserTest(`grid placement and wrapping preserve Chrome geometry at ${width}px in ${theme}`, async () => {
      const result = await convertHtml(FLOW_HTML, { css: FLOW_CSS, viewport: { width, height: 1800 }, theme, name: "LayoutFlow", mode: "fidelity" });
      expect(result.warnings).toEqual([]);
      const captured = new Map<string, LayoutNode>();
      const walk = (n: LayoutNode) => { if (n.attrs.id) captured.set(n.attrs.id, n); n.children.forEach(walk); };
      walk(result.layout.root);
      const semantic = new Map<string, SemNode>();
      visit(inferScreen(result.layout, "LayoutFlow").root, n => { if (n.id) semantic.set(n.id, n); });
      const node = (id: string) => semantic.get(`#${id}`)! as GridNode | StackNode;
      const measured = (id: string) => captured.get(id)!;
      const contentBox = (id: string) => {
        const n = measured(id), [top, right, bottom, left] = insetsOf(n.styles);
        return { x: n.bounds.x + left, y: n.bounds.y + top, w: n.bounds.w - left - right, h: n.bounds.h - top - bottom };
      };
      const matchesCaptured = (id: string) => {
        const n = node(id), source = measured(id), content = contentBox(id);
        expect(n.measured).toBeDefined();
        expect(n.measured!.width).toBeCloseTo(content.w, 2);
        expect(n.measured!.height).toBeCloseTo(content.h, 2);
        expect(n.children).toHaveLength(source.children.length);
        n.children.forEach((child, i) => {
          const original = source.children.find(item => item.id === child.id)!;
          const box = n.measured!.frames[i]!;
          expect(box.x).toBeCloseTo(original.bounds.x - content.x, 2);
          expect(box.y).toBeCloseTo(original.bounds.y - content.y, 2);
          expect(box.w).toBeCloseTo(original.bounds.w, 2);
          expect(box.h).toBeCloseTo(original.bounds.h, 2);
        });
        expect(result.diagnostics.find(item => item.id === `#${id}`)?.confidence).toBe("approximated");
      };
      const unequal = node("unequal-grid") as GridNode;
      expect(unequal.kind).toBe("grid");
      expect(unequal.measured).toBeUndefined();
      expect(unequal.columns).toBe(2);
      expect(unequal.children.map(child => child.width)).toEqual([
        { kind: "fixed", px: 100 }, { kind: "fixed", px: contentBox("unequal-grid").w - 110 },
      ]);
      for (const id of ["hole-grid", "aligned-grid", "span-grid", "empty-grid", "areas-grid", "overlap-grid"]) matchesCaptured(id);
      expect((node("hole-grid") as GridNode).columns).toBe(3);
      expect((node("aligned-grid") as GridNode).columns).toBe(2);
      expect((node("empty-grid") as GridNode).columns).toBe(3);
      expect(node("overlap-grid").children.at(-1)!.id).toBe("#overlap-front");
      for (const id of ["native-wrap", "single-wrap"]) {
        const n = node(id) as StackNode;
        expect(n.wrap).toEqual({ columnGap: 10, rowGap: 8 });
        expect(n.measured).toBeUndefined();
        expect(n.children).toHaveLength(3);
      }
      for (const id of ["reverse-wrap", "column-wrap", "distributed-wrap"]) matchesCaptured(id);
      expect(result.code).toContain("MarkswiftFlow(");
      expect(result.code).toContain("MarkswiftMeasuredLayout(");
      expect(result.diagnostics.some(item => item.confidence === "unmapped")).toBe(false);
    }, 30000);
  }
}
