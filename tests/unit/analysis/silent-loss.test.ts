/**
 * Inference losses that used to happen without a diagnostic (audit 2026-10-10). Each block is a
 * characterization of one bug: it failed before the fix and pins the fixed behaviour.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { normalizeWhitespace } from "../../../src/analysis/text-runs.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { SemNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = [], attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, ...styles }, bounds, children };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode): LayoutDoc {
  return { version: 2, source: "test", combo: { screen: "s", theme: "light" }, size: { w: root.bounds.w, h: root.bounds.h }, dpr: 3, canvas: "rgb(255, 255, 255)", fonts: [], root };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

describe("BUG-16 preserve-mode source map", () => {
  // `markLineBreaks` indexes the source map in UTF-16 units; a code-point map came up short after an emoji.
  test("one entry per UTF-16 unit", () => {
    const text = "a😀b\nc";
    expect(normalizeWhitespace(text, "preserve").src).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
