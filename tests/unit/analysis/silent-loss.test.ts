/**
 * Inference losses that used to happen without a diagnostic (audit 2026-10-10). Each block is a
 * characterization of one bug: it failed before the fix and pins the fixed behaviour.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { normalizeWhitespace, collectRuns, groupRuns } from "../../../src/analysis/text-runs.ts";
import type { SourceTextRun } from "../../../src/analysis/context.ts";
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

describe("BUG-05 non-collapsible spaces", () => {
  // CSS collapses only space, tab, segment breaks and form feed; JS `\s` also matched NBSP and friends.
  test("NBSP survives collapse; ASCII whitespace still collapses", () => {
    expect(normalizeWhitespace("10\u00A0km", "collapse").text).toBe("10\u00A0km");
    expect(normalizeWhitespace("a\u00A0\u00A0b", "collapse").text).toBe("a\u00A0\u00A0b");
    expect(normalizeWhitespace("a \n\t b", "collapse").text).toBe("a b");
  });

  test("an NBSP-only cell is text, not an empty box", () => {
    const td = el("td", { x: 0, y: 0, w: 200, h: 20 }, { display: "table-cell" }, [textNode("\u00A0", { x: 0, y: 3, w: 4, h: 14 })]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [td])), "S");
    const sem = flatten(screen.root).find((n) => n.frame.w === 200 && n !== screen.root);
    expect(sem?.kind).toBe("text");
    expect(sem?.kind === "text" ? sem.runs[0]?.text : undefined).toBe("\u00A0");
  });
});

describe("BUG-01 groupRuns", () => {
  // Every run of one inline element shares its top-level child, so the second run of `<b>` must
  // not open a new group: only a flow child between runs does.
  test("runs under one inline ancestor stay one group", () => {
    const b = el("b", { x: 70, y: 3, w: 60, h: 14 }, { "font-weight": "700" }, [textNode("the ", { x: 70, y: 3, w: 25, h: 14 }), el("i", { x: 95, y: 3, w: 35, h: 14 }, { "font-style": "italic" }, [textNode("terms", { x: 95, y: 3, w: 35, h: 14 })])]);
    const host = el("div", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [el("img", { x: 0, y: 0, w: 16, h: 16 }, {}), textNode(" Accept ", { x: 16, y: 3, w: 54, h: 14 }), b, textNode(" now", { x: 130, y: 3, w: 30, h: 14 })]);
    const runs: SourceTextRun[] = [];
    for (const c of host.children) {
      if (c.tag === "#text") runs.push({ node: c, styleOf: host });
      else if (c === b) collectRuns(b, runs);
    }
    const groups = groupRuns(host, runs);
    expect(groups.length).toBe(1);
    expect(groups[0]!.length).toBe(4);
  });

  test("a checkbox label with nested inline markup is one text node", () => {
    const b = el("b", { x: 70, y: 3, w: 60, h: 14 }, { "font-weight": "700" }, [textNode("the ", { x: 70, y: 3, w: 25, h: 14 }), el("i", { x: 95, y: 3, w: 35, h: 14 }, { "font-style": "italic" }, [textNode("terms", { x: 95, y: 3, w: 35, h: 14 })])]);
    const li = el("li", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [
      el("input", { x: 0, y: 2, w: 16, h: 16 }, { display: "inline-block" }, [], { type: "checkbox" }),
      textNode(" Accept ", { x: 16, y: 3, w: 54, h: 14 }),
      b,
      textNode(" now", { x: 130, y: 3, w: 30, h: 14 }),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 200, h: 20 }, { display: "block" }, [li])), "S");
    const texts = flatten(screen.root).filter((n) => n.kind === "text");
    expect(texts.length).toBe(1);
    expect(texts[0]!.kind === "text" ? texts[0]!.runs.map((r) => r.text).join("") : "").toBe("Accept the terms now");
  });
});

describe("BUG-18 synthetic text item", () => {
  // The text group between flow children used to be a copy of the host node, so it carried the
  // host's float and margins into line and stack building.
  test("a floated host's text group does not float", () => {
    const host = el("div", { x: 0, y: 8, w: 200, h: 24 }, { display: "block", float: "left", "margin-top": "8px" }, [
      el("svg", { x: 0, y: 12, w: 16, h: 16 }, {}, [], { viewbox: "0 0 16 16" }),
      textNode("Label", { x: 20, y: 13, w: 40, h: 14 }),
    ]);
    host.id = "#host";
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 300, h: 40 }, { display: "block" }, [host])), "S");
    const sem = flatten(screen.root).find((n) => n.id === "#host");
    expect(sem).toBeDefined();
    expect(sem!.diagnostics.map((d) => d.message).filter((m) => m.includes("float"))).toEqual([]);
  });
});

describe("BUG-11 nested fixed", () => {
  // Building a fixed layer hoists its own fixed descendants after the overlay list was copied.
  test("a fixed node inside a fixed layer is built", () => {
    const inner = el("div", { x: 300, y: 20, w: 60, h: 40 }, { display: "block", position: "fixed", "background-color": "rgb(255, 0, 0)" });
    inner.id = "#inner";
    const outer = el("div", { x: 0, y: 700, w: 390, h: 100 }, { display: "block", position: "fixed", "background-color": "rgb(0, 0, 255)" }, [inner]);
    outer.id = "#outer";
    const section = el("section", { x: 0, y: 0, w: 390, h: 100 }, { display: "block" }, [outer]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 390, h: 800 }, { display: "block" }, [section])), "S");
    const ids = flatten(screen.root).map((n) => n.id);
    expect(ids).toContain("#outer");
    expect(ids).toContain("#inner");
  });
});

describe("BUG-17 hidden runs", () => {
  // `visibility: hidden` was read per node only: a hidden inline span painted its glyphs.
  test("a hidden span keeps its advance and paints nothing", () => {
    const p = el("p", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [
      textNode("Hello ", { x: 0, y: 3, w: 40, h: 14 }),
      el("span", { x: 40, y: 3, w: 45, h: 14 }, { visibility: "hidden" }, [textNode("secret", { x: 40, y: 3, w: 45, h: 14 })]),
      textNode(" world", { x: 85, y: 3, w: 40, h: 14 }),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [p])), "S");
    const t = flatten(screen.root).find((n) => n.kind === "text");
    expect(t?.kind).toBe("text");
    const runs = t?.kind === "text" ? t.runs : [];
    const hidden = runs.filter((r) => r.text.includes("secret"));
    expect(hidden.length).toBe(1);
    expect(hidden[0]!.color.a).toBe(0);
    for (const r of runs) if (!r.text.includes("secret") && r.text.trim()) expect(r.color.a).toBe(1);
  });
});
