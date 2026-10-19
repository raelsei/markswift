/** `position: relative` offsets: resolved from Typed-OM insets, drawn with `.offset`, siblings unshifted. */
import { describe, expect, test } from "bun:test";
import { relativeOffset } from "../../../src/analysis/geometry.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Rect } from "../../../src/model/layout.ts";
import type { SemNode, StackNode, TextNode } from "../../../src/model/semantic.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = []): LayoutNode {
  return { tag, attrs: {}, styles: { ...INHERITED, ...styles }, bounds, children };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "test",
    combo: { screen: "s", theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    viewport: { x: 0, y: 0, w: root.bounds.w, h: root.bounds.h },
    conditions: [],
    dpr: 3,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

type Insets = [string, string, string, string];

function rel(
  [top, right, bottom, left]: Insets,
  styles: Record<string, string> = {},
  height = "auto",
  bounds: Rect = { x: 24, y: 24, w: 343, h: 28 },
): LayoutNode {
  return {
    ...el("div", bounds, { display: "block", position: "relative", ...styles }),
    preferredSize: { width: "auto", height, insets: { top, right, bottom, left } },
  };
}

const PAD = { "padding-top": "8px", "padding-right": "8px", "padding-bottom": "8px", "padding-left": "8px" };
const cb = (styles: Record<string, string> = {}, height?: string): LayoutNode => ({
  ...el("div", { x: 16, y: 16, w: 359, h: 136 }, { display: "block", ...PAD, ...styles }),
  ...(height ? { preferredSize: { width: "auto", height } } : {}),
});

describe("relativeOffset", () => {
  const AUTO_H = "top 10% → auto (no definite containing-block height)";
  const AUTO_W = "left 10% → auto (no definite containing-block width)";
  test.each<[string, LayoutNode, LayoutNode | undefined, [number, number], string[]]>([
    ["px", rel(["6px", "auto", "auto", "12px"]), cb(), [12, 6], []],
    ["right/bottom", rel(["auto", "10px", "4px", "auto"]), cb(), [-10, -4], []],
    ["% width", rel(["auto", "auto", "auto", "10%"]), cb(), [34.3, 0], ["left 10% → offset pinned at 34.3px"]],
    ["% top, auto height", rel(["10%", "auto", "auto", "auto"]), cb(), [0, 0], [AUTO_H]],
    ["% top beside bottom, auto height", rel(["10%", "auto", "5px", "auto"]), cb(), [0, -5], [AUTO_H]],
    [
      "% top, px height",
      rel(["25%", "auto", "auto", "auto"]),
      cb({}, "120px"),
      [0, 30],
      ["top 25% → offset pinned at 30px"],
    ],
    ["rtl: right wins", rel(["auto", "24px", "auto", "8px"]), cb({ direction: "rtl" }), [-24, 0], []],
    ["ltr: left wins", rel(["auto", "24px", "auto", "8px"]), cb(), [8, 0], []],
    [
      "calc",
      rel(["15px", "auto", "auto", "calc(10% + 5px)"]),
      cb(),
      [39.3, 15],
      ["left calc(10% + 5px) → offset pinned at 39.3px"],
    ],
    ["grid parent", rel(["auto", "auto", "auto", "10%"]), cb({ display: "grid" }), [0, 0], [AUTO_W]],
    ["root", rel(["5px", "auto", "auto", "10%"]), undefined, [0, 5], [AUTO_W]],
    [
      "unparseable",
      rel(["min(4px, 8px)", "auto", "auto", "auto"]),
      cb(),
      [0, 0],
      ["top min(4px, 8px) → 0 (not a px/% length)"],
    ],
    ["absolute", rel(["8px", "auto", "auto", "8px"], { position: "absolute" }), cb(), [0, 0], []],
    ["sticky", rel(["0px", "auto", "auto", "auto"], { position: "sticky" }), cb(), [0, 0], []],
    ["no preferredSize", el("div", { x: 24, y: 24, w: 343, h: 28 }, { position: "relative" }), cb(), [0, 0], []],
  ])("%s", (_, n, parent, offset, losses) => {
    expect(relativeOffset(n, parent)).toEqual({ offset, losses });
  });
});

/** A 3-row block whose middle row carries `position` and the given insets, laid out at its flow box (y 50). */
function screenWith(position: "relative" | "sticky", insets: Insets) {
  const row = (y: number) => el("div", { x: 16, y, w: 361, h: 28 }, { display: "block", height: "28px" });
  const middle = rel(insets, { position, rotate: "45deg", height: "28px" }, "28px", { x: 16, y: 50, w: 361, h: 28 });
  const pad = { "padding-top": "16px", "padding-right": "16px", "padding-bottom": "16px", "padding-left": "16px" };
  const root = el("main", { x: 0, y: 0, w: 393, h: 128 }, { display: "block", ...pad }, [row(16), middle, row(84)]);
  return inferScreen(doc(root), "s");
}

describe("placement", () => {
  test("siblings stay put and the offset rides on the box", () => {
    const screen = screenWith("relative", ["6px", "auto", "auto", "12px"]);
    const root = screen.root as StackNode;
    expect(root.kind).toBe("stack");
    expect(root.spacing).toBe(6);
    const mid = root.children[1]!;
    expect(mid.frame.y).toBe(50);
    expect(mid.relativeOffset).toEqual([12, 6]);
    expect(flatten(root).flatMap((n) => n.diagnostics.filter((d) => d.feature === "position: relative"))).toEqual([]);
  });

  test("emitted once, outside the rotation, in both modes", () => {
    const screen = screenWith("relative", ["6px", "auto", "auto", "12px"]);
    for (const mode of ["app", "fidelity"] as const) {
      const view = emitSwift(screen, "RelView", { mode }).view;
      expect(view.split(".offset(x: 12.0, y: 6.0)").length - 1).toBe(1);
      expect(view.indexOf(".offset(x: 12.0, y: 6.0)")).toBeGreaterThan(view.indexOf(".rotationEffect("));
      expect(view.indexOf(".rotationEffect(")).toBeGreaterThan(-1);
      // Positioned boxes paint above their in-flow siblings.
      expect(view).toMatch(/\.offset\(x: 12\.0, y: 6\.0\)\n\s*\.zIndex\(1\)/);
    }
  });

  test("sticky stays at its snapshot position", () => {
    const screen = screenWith("sticky", ["0px", "auto", "auto", "auto"]);
    const nodes = flatten(screen.root);
    expect(nodes.some((n) => n.relativeOffset)).toBe(false);
    expect(emitSwift(screen, "RelView", { mode: "app" }).view).not.toContain(".offset(x: 12.0");
    expect(nodes.flatMap((n) => n.diagnostics.map((d) => d.message))).toContain("position: sticky (snapshot position)");
  });

  test("an inline run paints its offset without changing line layout", () => {
    const span = {
      ...el("span", { x: 14, y: -1, w: 10, h: 14 }, { display: "inline", position: "relative" }, [
        textNode("b", { x: 14, y: -1, w: 10, h: 14 }),
      ]),
      preferredSize: {
        width: "auto",
        height: "auto",
        insets: { top: "-4px", right: "auto", bottom: "auto", left: "auto" },
      },
    };
    const p = el("p", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [
      textNode("a ", { x: 0, y: 3, w: 14, h: 14 }),
      span,
      textNode(" c", { x: 24, y: 3, w: 14, h: 14 }),
    ]);
    const screen = inferScreen(doc(el("main", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [p])), "s");
    const t = flatten(screen.root).find((n): n is TextNode => n.kind === "text")!;
    expect(t.runs.find((r) => r.text === "b")?.relativeOffset).toEqual([0, -4]);
    expect(t.diagnostics.some((d) => d.message.includes("relative offset"))).toBe(false);
    expect(emitSwift(screen, "RelView", { mode: "app" }).view).toContain(
      ".customAttribute(MarkswiftTextOffset(x: 0.0, y: -4.0))",
    );
  });
});
