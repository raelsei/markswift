/**
 * Plan 010: app mode follows CSS intent instead of the capture device (object-fit, bottom slack,
 * viewport heights, page scroll, corner-anchored overlays). Hand-built measured trees.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { SemNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function el(tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = [], attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { ...INHERITED, ...styles }, bounds, children, ...(attrs["id"] ? { id: attrs["id"] } : {}) };
}

function textNode(text: string, bounds: Rect): LayoutNode {
  return { tag: "#text", attrs: {}, styles: { ...INHERITED }, bounds, text, children: [] };
}

function doc(root: LayoutNode, viewport?: Rect): LayoutDoc {
  return { version: 2, source: "test", combo: { screen: "s", theme: "light" }, size: { w: root.bounds.w, h: root.bounds.h }, dpr: 3, canvas: "rgb(255, 255, 255)", fonts: [], root, ...(viewport ? { viewport } : {}) };
}

function flatten(n: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(n);
  for (const c of "children" in n && n.children ? n.children : []) flatten(c, out);
  for (const c of "content" in n && n.content ? n.content : []) flatten(c, out);
  for (const o of n.overlays) flatten(o.node, out);
  return out;
}

const byId = (root: SemNode, id: string) => flatten(root).find((n) => n.id === id)!;
const features = (n: SemNode) => n.diagnostics.map((d) => `${d.level}:${d.feature}`);
const code = (d: LayoutDoc, mode: "app" | "fidelity" = "app") => compileLayout(d, { name: "F", mode }).code;

describe("Step 1 object-fit", () => {
  const fixture = (fit?: string, position?: string) => doc(el("main", { x: 0, y: 0, w: 200, h: 100 }, { display: "block" }, [
    { ...el("img", { x: 0, y: 0, w: 200, h: 100 }, { display: "block", ...(fit ? { "object-fit": fit } : {}), ...(position ? { "object-position": position } : {}) }, [], { id: "img", src: "photo.png" }), currentSrc: PNG },
  ]));
  const image = (d: LayoutDoc) => byId(inferScreen(d, "s").root, "img");

  test("fill (absent or explicit) stretches with a plain .resizable()", () => {
    for (const fit of [undefined, "fill"]) {
      const d = fixture(fit);
      expect(image(d)).toMatchObject({ kind: "image", contentMode: "fill" });
      const swift = code(d);
      expect(swift).toContain(".markswiftAsset(");
      expect(swift).toContain(".resizable()");
      expect(swift).not.toContain("aspectRatio");
      expect(swift).not.toContain(".clipped()");
    }
  });

  test("cover crops: aspect fill plus clip", () => {
    const d = fixture("cover");
    expect(image(d)).toMatchObject({ contentMode: "cover" });
    const swift = code(d);
    expect(swift).toContain(".aspectRatio(contentMode: .fill)");
    expect(swift).toContain(".clipped()");
  });

  test("contain letterboxes without a clip", () => {
    const swift = code(fixture("contain"));
    expect(swift).toContain(".aspectRatio(contentMode: .fit)");
    expect(swift).not.toContain(".clipped()");
  });

  test("none keeps the natural size, clipped", () => {
    const swift = code(fixture("none"));
    expect(swift).toContain(".markswiftAsset(");
    expect(swift).not.toContain(".resizable()");
    expect(swift).toContain(".clipped()");
  });

  test("scale-down maps to contain and is reported", () => {
    const img = image(fixture("scale-down"));
    expect(img).toMatchObject({ contentMode: "contain" });
    expect(features(img)).toContain("approximated:object-fit");
  });

  test("a percentage object-position aligns inside a box-filling Color.clear", () => {
    const d = fixture("cover", "50% 0%");
    expect(image(d)).toMatchObject({ position: [0.5, 0] });
    expect(code(d)).toMatch(/Color\.clear\s*\n\s*\.overlay\(alignment: \.top\) \{/);
  });

  test("a px object-position is centred and reported", () => {
    const img = image(fixture("cover", "10px 20px"));
    expect(img).not.toHaveProperty("position");
    expect(features(img)).toContain("approximated:object-position");
  });
});

describe("Step 3 trailing inset", () => {
  const RED = { "background-color": "rgb(255, 0, 0)" };

  test("min-height slack is not bottom padding", () => {
    const root = el("main", { x: 0, y: 0, w: 390, h: 760 }, { display: "block", "box-sizing": "border-box", "padding-top": "24px", "padding-bottom": "24px", "min-height": "760px" }, [
      el("div", { x: 0, y: 24, w: 390, h: 100 }, { display: "block", ...RED }),
    ], { id: "root" });
    const screen = inferScreen(doc(root), "s");
    expect(screen.root.padding[2]).toBe(24);
    expect(screen.root.minHeight).toBe(760);
  });

  test("an uncollapsed end margin stays in the inset", () => {
    const root = el("main", { x: 0, y: 0, w: 390, h: 124 }, { display: "block", "padding-bottom": "8px" }, [
      el("div", { x: 0, y: 0, w: 390, h: 100 }, { display: "block", "margin-bottom": "16px", ...RED }),
    ]);
    expect(inferScreen(doc(root), "s").root.padding[2]).toBe(24);
  });

  test("a grandchild end margin collapsing through its parent stays in the inset", () => {
    const root = el("main", { x: 0, y: 0, w: 390, h: 140 }, { display: "block", "padding-top": "16px", "padding-bottom": "16px" }, [
      el("section", { x: 0, y: 16, w: 390, h: 100 }, { display: "block", "margin-bottom": "0px" }, [
        el("div", { x: 0, y: 16, w: 390, h: 100 }, { display: "block", "margin-bottom": "8px", ...RED }),
      ]),
    ]);
    expect(inferScreen(doc(root), "s").root.padding[2]).toBe(24);
  });

  test("a centred flex column adds no bottom padding", () => {
    const root = el("main", { x: 0, y: 0, w: 390, h: 400 }, { display: "flex", "flex-direction": "column", "justify-content": "center" }, [
      el("div", { x: 0, y: 150, w: 390, h: 100 }, { display: "block", ...RED }),
    ]);
    expect(inferScreen(doc(root), "s").root.padding[2]).toBe(0);
  });

  test("half-leading under an inline-only child is not padding", () => {
    const root = el("main", { x: 0, y: 0, w: 300, h: 20 }, { display: "block" }, [
      el("p", { x: 0, y: 0, w: 300, h: 20 }, { display: "block", "line-height": "20px" }, [
        el("span", { x: 0, y: 3, w: 40, h: 14 }, { display: "inline" }, [textNode("Hi", { x: 0, y: 3, w: 40, h: 14 })]),
      ], { id: "p" }),
    ]);
    const p = byId(inferScreen(doc(root), "s").root, "p");
    expect(p.kind).toBe("text");
    expect(p.padding[2]).toBe(0);
  });
});

describe("Step 4 viewport", () => {
  const VIEWPORT = { x: 0, y: 0, w: 390, h: 844 };
  const RED = { "background-color": "rgb(255, 0, 0)" };
  const tallRoot = () => el("main", { x: 0, y: 0, w: 390, h: 844 }, { display: "block", "min-height": "844px" }, [
    el("div", { x: 0, y: 0, w: 390, h: 100 }, { display: "block", ...RED }),
  ]);

  test("a viewport-high root min-height is dropped", () => {
    const root = inferScreen(doc(tallRoot(), VIEWPORT), "s").root;
    expect(root.minHeight).toBeUndefined();
    expect(features(root)).not.toContain("approximated:min-height");
  });

  test("a viewport-high non-root min-height stays a floor and is reported", () => {
    const root = el("main", { x: 0, y: 0, w: 390, h: 1000 }, { display: "block" }, [
      el("section", { x: 0, y: 0, w: 390, h: 844 }, { display: "block", "min-height": "844px", ...RED }, [
        el("div", { x: 0, y: 0, w: 390, h: 100 }, { display: "block", ...RED }),
      ], { id: "s" }),
    ]);
    const s = byId(inferScreen(doc(root, VIEWPORT), "s").root, "s");
    expect(s.minHeight).toBe(844);
    expect(features(s)).toContain("approximated:min-height");
  });

  test("without a recorded viewport the root keeps its min-height", () => {
    expect(inferScreen(doc(tallRoot()), "s").root.minHeight).toBe(844);
  });
});

describe("Step 5 page scroll", () => {
  const VIEWPORT = { x: 0, y: 0, w: 390, h: 844 };
  const page = (h: number) => doc({ ...el("main", { x: 0, y: 0, w: 390, h }, { display: "block" }, [
    { ...el("div", { x: 0, y: 0, w: 390, h: h / 2 }, { display: "block", "background-color": "rgb(255, 0, 0)" }), paint: 1 },
    { ...el("div", { x: 0, y: h / 2, w: 390, h: h / 2 }, { display: "block", "background-color": "rgb(0, 255, 0)" }), paint: 2 },
    { ...el("div", { x: 0, y: 784, w: 390, h: 60 }, { display: "block", position: "fixed", "background-color": "rgb(0, 0, 255)" }, [], { id: "bar" }), paint: 3 },
  ], { id: "root" }), paint: 0 }, VIEWPORT);

  test("a page taller than the viewport scrolls; its fixed bar is marked", () => {
    const root = inferScreen(page(2000), "s").root;
    expect(root.kind).toBe("stack");
    expect(root.kind === "stack" && root.scroll).toBe("v");
    const bar = root.overlays.find((o) => o.node.id === "bar")!;
    expect(bar).toMatchObject({ fixed: true, layer: "overlay" });
  });

  test("app mode hoists the fixed bar outside the ScrollView", () => {
    const lines = code(page(2000)).split("\n");
    const i = lines.findIndex((l) => l.includes("ScrollView(.vertical"));
    expect(i).toBeGreaterThanOrEqual(0);
    const k = lines[i]!.length - lines[i]!.trimStart().length;
    const close = lines.findIndex((l, j) => j > i && l === " ".repeat(k) + "}");
    expect(close).toBeGreaterThan(i);
    expect(lines.slice(close + 1).some((l) => l.startsWith(" ".repeat(k) + ".overlay("))).toBe(true);
  });

  test("fidelity has no ScrollView", () => {
    expect(code(page(2000), "fidelity")).not.toContain("ScrollView");
  });

  test("a page within the viewport does not scroll", () => {
    const root = inferScreen(page(800), "s").root;
    expect(root.kind === "stack" && root.scroll).toBeFalsy();
  });
});

describe("Step 6 overlay anchoring", () => {
  const RED = { "background-color": "rgb(255, 0, 0)" };
  const card = (y: number, insets: { top: string; right: string; bottom: string; left: string }) => doc({ ...el("main", { x: 0, y: 0, w: 300, h: 200 }, { display: "block", position: "relative" }, [
    { ...el("div", { x: 0, y: 0, w: 300, h: 200 }, { display: "block", ...RED }), paint: 1 },
    { ...el("div", { x: 264, y, w: 20, h: 20 }, { display: "block", position: "absolute", "background-color": "rgb(0, 0, 255)" }, [], { id: "x" }), paint: 2, preferredSize: { width: "20px", height: "20px", insets } },
  ]), paint: 0 });
  const overlay = (d: LayoutDoc, id: string) => inferScreen(d, "s").root.overlays.find((o) => o.node.id === id)!;

  test("a right-anchored box keeps its trailing corner in app mode only", () => {
    const d = card(8, { top: "8px", right: "16px", bottom: "auto", left: "auto" });
    expect(overlay(d, "x")).toMatchObject({ anchor: { corner: "topTrailing", offset: [-16, 8] }, offset: [264, 8] });
    const app = code(d);
    expect(app).toContain(".overlay(alignment: .topTrailing) {");
    expect(app).toContain(".offset(x: -16.0, y: 8.0)");
    const fidelity = code(d, "fidelity");
    expect(fidelity).toContain(".overlay(alignment: .topLeading) {");
    expect(fidelity).toContain(".offset(x: 264.0, y: 8.0)");
  });

  test("a bottom-right-anchored box keeps the bottom trailing corner", () => {
    const d = card(168, { top: "auto", right: "16px", bottom: "12px", left: "auto" });
    expect(overlay(d, "x").anchor).toEqual({ corner: "bottomTrailing", offset: [-16, -12] });
  });

  test("a fixed bottom bar anchors to the viewport, not the page", () => {
    const d = doc({ ...el("main", { x: 0, y: 0, w: 390, h: 2000 }, { display: "block" }, [
      { ...el("div", { x: 0, y: 0, w: 390, h: 2000 }, { display: "block", ...RED }), paint: 1 },
      { ...el("div", { x: 0, y: 784, w: 390, h: 60 }, { display: "block", position: "fixed", "background-color": "rgb(0, 0, 255)" }, [], { id: "bar" }), paint: 3, preferredSize: { width: "390px", height: "60px", insets: { top: "auto", right: "0px", bottom: "0px", left: "0px" } } },
    ]), paint: 0 }, { x: 0, y: 0, w: 390, h: 844 });
    const anchor = overlay(d, "bar").anchor!;
    expect(anchor.corner).toBe("bottomLeading");
    expect(anchor.offset[1]).toBe(0);
  });
});
