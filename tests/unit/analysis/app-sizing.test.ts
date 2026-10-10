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
