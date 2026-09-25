/**
 * Semantic inference over hand-built layout docs. One measured tree per case, so a regression
 * shows up in `bun test` seconds instead of a corpus run.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { SemNode, TextNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = [], attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, ...styles }, bounds, children };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode): LayoutDoc {
  return { version: 1, source: "test", combo: { screen: "s", theme: "light", demoState: "normal" }, size: { w: root.bounds.w, h: root.bounds.h }, dpr: 3, canvas: "rgb(255, 255, 255)", root };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

describe("text groups", () => {
  // Two inline controls on separate source lines: the whitespace between them is a text node the
  // browser collapsed away entirely. It used to become a `TextNode` with zero runs, which the
  // emitter wrote as `Text.h2sRuns([\n    ,\n])` — invalid Swift in both modes.
  test("a run group that is nothing but collapsed whitespace does not become a text node", () => {
    const section = el(
      "section",
      { x: 0, y: 0, w: 200, h: 21 },
      { display: "block" },
      [
        textNode("\n  ", { x: 0, y: 0, w: 0, h: 0 }),
        el("input", { x: 0, y: 0, w: 70, h: 21 }, {}, [], { type: "text", value: "a" }),
        textNode("\n  ", { x: 70, y: 0, w: 4, h: 21 }),
        el("input", { x: 74, y: 0, w: 70, h: 21 }, {}, [], { type: "text", value: "b" }),
        textNode("\n", { x: 0, y: 0, w: 0, h: 0 }),
      ],
    );
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 21 }, { display: "block" }, [section])), "s");
    const texts = flatten(screen.root).filter((n): n is TextNode => n.kind === "text");
    expect(texts.map((t) => t.runs.length)).not.toContain(0);
  });

  test("a whitespace-only element is its own box, not an empty text node", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("div", { x: 0, y: 0, w: 200, h: 20 }, { "background-color": "rgb(255, 0, 0)" }, [textNode("   ", { x: 0, y: 0, w: 0, h: 0 })]),
    ]);
    const div = flatten(inferScreen(doc(root), "s").root).find((n) => n.frame.h === 20 && n.kind !== "stack");
    expect(div?.kind).toBe("box");
  });

  test("real text still becomes a text node with its runs", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 20 }, {}, [textNode("hello", { x: 0, y: 3, w: 40, h: 14 })]),
    ]);
    const texts = flatten(inferScreen(doc(root), "s").root).filter((n): n is TextNode => n.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0]?.runs.map((r) => r.text)).toEqual(["hello"]);
  });
});

describe("line height", () => {
  // Tailwind's type scale always sets both, so this is the common case, not the exception.
  test("an explicit line-height rides on the run's font and is no longer an approximation", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 20 }, { "line-height": "20px" }, [textNode("hello", { x: 0, y: 3, w: 40, h: 14 })]),
    ]);
    const text = flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text");
    expect(text?.runs[0]?.font.lineHeight).toBe(20);
    expect(text?.notes).toEqual([]);
    expect(text?.confidence).toBe("mapped");
  });

  test("line-height: normal leaves the font without one", () => {
    const root = el("main", { x: 0, y: 0, w: 200, h: 17 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 200, h: 17 }, { "line-height": "normal" }, [textNode("hello", { x: 0, y: 1, w: 40, h: 14 })]),
    ]);
    const text = flatten(inferScreen(doc(root), "s").root).find((n): n is TextNode => n.kind === "text");
    expect(text?.runs[0]?.font.lineHeight).toBeUndefined();
  });
});

test("flow, inline break, native control and positioned decoration keep semantic order", () => {
  const row = el("section", { x: 0, y: 0, w: 180, h: 30 }, { display: "block" }, [
    el("div", { x: 0, y: 0, w: 80, h: 30 }, { display: "inline-block", float: "left" }),
    el("div", { x: 90, y: 0, w: 80, h: 30 }, { display: "inline-block" }),
  ], { id: "row" });
  const copy = el("p", { x: 0, y: 40, w: 180, h: 20 }, { display: "block" }, [
    textNode("Alpha", { x: 0, y: 40, w: 40, h: 20 }),
    el("wbr", { x: 40, y: 40, w: 0, h: 20 }, {}),
    textNode("Beta", { x: 40, y: 40, w: 35, h: 20 }),
  ], { id: "copy" });
  const input = el("input", { x: 0, y: 70, w: 120, h: 28 }, {}, [], { id: "field", type: "text", value: "Ada" });
  const badge = el("div", { x: 140, y: 5, w: 30, h: 20 }, { position: "absolute" }, [], { id: "badge" });
  badge.id = "#badge";
  const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 120 }, { display: "block" }, [row, copy, input, badge])), "s");
  expect(screen.root.kind).toBe("stack");
  if (screen.root.kind !== "stack") return;
  expect(screen.root.children.map((child) => child.kind)).toEqual(["stack", "text", "control"]);
  expect(screen.root.overlays.map((overlay) => [overlay.node.id, overlay.offset])).toEqual([["#badge", [140, 5]]]);
  expect(flatten(screen.root).filter((node) => node.notes.length).map((node) => node.notes[0])).toEqual([
    "approximated: float → side-by-side row; text does not wrap around it",
    "approximated: <wbr> → zero-width break opportunity; native line breaking may differ",
  ]);
});
