/** Generated content: inline pseudo images as text runs, counters on marker/`counter()` runs, alt, undrawn urls. */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Rect } from "../../../src/model/layout.ts";
import type { ImageNode, SemNode, TextNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "18px" };
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";
const SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23f59e0b'/%3E%3C/svg%3E";

const el = (tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = []): LayoutNode => ({
  tag,
  attrs: {},
  styles: { ...INHERITED, ...styles },
  bounds,
  children,
});
const txt = (text: string, bounds: Rect): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds,
  text,
  children: [],
});
const img = (src: string, bounds: Rect): LayoutNode => ({
  tag: "img",
  attrs: { src },
  styles: {},
  bounds,
  children: [],
});

function screen(...children: LayoutNode[]): SemNode[] {
  const root = el("main", { x: 0, y: 0, w: 300, h: 400 }, { display: "block" }, children);
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "test",
    combo: { screen: "s", theme: "light" },
    size: { w: 300, h: 400 },
    viewport: { x: 0, y: 0, w: 300, h: 400 },
    conditions: [],
    dpr: 3,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
  const out: SemNode[] = [];
  const walk = (n: SemNode) => {
    out.push(n);
    for (const c of "children" in n && n.children ? n.children : []) walk(c);
    for (const c of "content" in n && n.content ? n.content : []) walk(c);
    for (const o of n.overlays) walk(o.node);
  };
  walk(inferScreen(doc, "s").root);
  return out;
}
const texts = (nodes: SemNode[]) => nodes.filter((n): n is TextNode => n.kind === "text");
const images = (nodes: SemNode[]) => nodes.filter((n): n is ImageNode => n.kind === "image");

/** `<p>` with an inline `::before` (`content`, one img child, then text) and its own text. */
function badge(pseudo: Record<string, string>, imgBox: Rect, src = PNG): SemNode[] {
  const before = el("::before", { x: 16, y: 116, w: 60, h: 18 }, { display: "inline", ...pseudo }, [
    img(src, imgBox),
    txt(" New ", { x: 40, y: 116, w: 36, h: 18 }),
  ]);
  return screen(
    el("p", { x: 16, y: 116, w: 268, h: 18 }, { display: "block" }, [
      before,
      txt("Dark mode", { x: 76, y: 116, w: 70, h: 18 }),
    ]),
  );
}

describe("inline generated images", () => {
  test("a data: image in an inline ::before rides in the paragraph's text", () => {
    const nodes = badge({ content: `url("${PNG}") " New "` }, { x: 16, y: 116, w: 24, h: 16 });
    const t = texts(nodes);
    expect(t).toHaveLength(1);
    expect(t[0]!.runs.map((r) => r.text)).toEqual(["\uFFFC", " New ", "Dark mode"]);
    expect(t[0]!.runs[0]!.image).toEqual({ src: PNG, w: 24, h: 16 });
    expect(images(nodes)).toEqual([]);
  });

  test("vertical-align on the pseudo shifts the image by its bottom edge", () => {
    // Host baseline 116 + 0.8 × 18 = 130.4; the image's bottom edge 126.4 is 4 px above it.
    const nodes = badge(
      { content: `url("${PNG}") " New "`, "vertical-align": "middle" },
      { x: 16, y: 110.4, w: 24, h: 16 },
    );
    expect(texts(nodes)[0]!.runs[0]!.baselineOffset).toBeCloseTo(4, 1);
  });

  test("a remote source keeps the generic route", () => {
    const nodes = badge(
      { content: `url("https://x.test/a.png") " New "` },
      { x: 16, y: 116, w: 24, h: 16 },
      "https://x.test/a.png",
    );
    expect(
      texts(nodes)
        .flatMap((t) => t.runs)
        .some((r) => r.image),
    ).toBe(false);
    expect(images(nodes)).toHaveLength(1);
  });

  test("a non-inline pseudo image is an ImageNode: alt from content, else decorative", () => {
    const info = (content: string) =>
      screen(
        el("p", { x: 0, y: 0, w: 300, h: 18 }, { display: "block" }, [
          el("::before", { x: 0, y: 1, w: 16, h: 16 }, { display: "inline-block", content }, [
            img(SVG, { x: 0, y: 1, w: 16, h: 16 }),
          ]),
          txt("Generated image", { x: 24, y: 0, w: 110, h: 18 }),
        ]),
      );
    expect(images(info(`url("${SVG}") / "Info"`))[0]!.alt).toBe("Info");
    expect(images(info(`url("${SVG}")`))[0]!.alt).toBe("");
  });
});

/** `<li>` whose first child is `pseudo` (one `#text` child `text`), then `#text "Plan"`; the runs of its TextNode. */
function runsOf(tag: string, styles: Record<string, string>, text: string) {
  const p = el(tag, { x: 0, y: 0, w: 30, h: 18 }, { display: "inline", ...styles }, [
    txt(text, { x: 0, y: 0, w: 30, h: 18 }),
  ]);
  const li = el("li", { x: 0, y: 0, w: 300, h: 18 }, { display: "list-item" }, [
    p,
    txt("Plan", { x: 30, y: 0, w: 40, h: 18 }),
  ]);
  return texts(screen(li))[0]!.runs;
}
const MARKER = { content: "normal", "white-space-collapse": "preserve" };

describe("counters", () => {
  test("::marker of a counter list-style-type", () => {
    expect(runsOf("::marker", { ...MARKER, "list-style-type": "lower-roman" }, "iv. ")[0]!.counter).toEqual({
      style: "lower-roman",
      value: 4,
      prefix: "",
      suffix: ". ",
    });
    expect(runsOf("::marker", { ...MARKER, "list-style-type": "disc" }, "• ")[0]!.counter).toBeUndefined();
    expect(runsOf("::marker", { ...MARKER, "list-style-type": "lower-greek" }, "δ. ")[0]!.counter).toBeUndefined();
    expect(runsOf("::marker", { ...MARKER, content: '"→ "' }, "→ ")[0]!.counter).toBeUndefined();
  });

  test("::before counter() content", () => {
    expect(runsOf("::before", { content: "counter(step)" }, "3")[0]!.counter).toEqual({
      style: "decimal",
      value: 3,
      prefix: "",
      suffix: "",
    });
    const roman = runsOf("::before", { content: 'counter(n, upper-roman) ") "' }, "IV) ")[0]!;
    expect(roman.counter).toEqual({ style: "upper-roman", value: 4, prefix: "", suffix: ") " });
    // LayoutDoc 3 kept only the last text part.
    expect(runsOf("::before", { content: 'counter(n, upper-roman) ") "' }, ") ")[0]!.counter).toBeUndefined();
  });

  test("isolated markers and generated counters retain isolation when regenerated", () => {
    const marker = runsOf(
      "::marker",
      { ...MARKER, "list-style-type": "upper-roman", "unicode-bidi": "isolate" },
      "I. ",
    )[0]!;
    expect(marker.text).toBe("\u2066I. \u2069");
    expect(marker.counter).toEqual({ style: "upper-roman", value: 1, prefix: "\u2066", suffix: ". \u2069" });
    const before = runsOf("::before", { content: "counter(step)", "unicode-bidi": "isolate" }, "3")[0]!;
    expect(before.text).toBe("\u20663\u2069");
    expect(before.counter).toEqual({ style: "decimal", value: 3, prefix: "\u2066", suffix: "\u2069" });
  });
});

describe("undrawn generated images", () => {
  const diags = (nodes: SemNode[]) => nodes.flatMap((n) => n.diagnostics);
  test("content names more url()s than img children", () => {
    const nodes = screen(
      el("p", { x: 0, y: 0, w: 300, h: 18 }, { display: "block" }, [
        el("::before", { x: 0, y: 0, w: 10, h: 18 }, { display: "inline", content: `url("${PNG}") url("${PNG}")` }, [
          img(PNG, { x: 0, y: 4, w: 10, h: 10 }),
        ]),
        txt("Text", { x: 10, y: 0, w: 30, h: 18 }),
      ]),
    );
    expect(diags(nodes)).toContainEqual(
      expect.objectContaining({
        level: "approximated",
        feature: "content",
        message: expect.stringContaining("asks for 2"),
      }),
    );
  });

  test("a marker whose list-style-image was not laid out", () => {
    const nodes = screen(
      el("li", { x: 0, y: 0, w: 300, h: 18 }, { display: "list-item" }, [
        el(
          "::marker",
          { x: 0, y: 0, w: 10, h: 18 },
          { display: "inline", ...MARKER, "list-style-image": `url("${PNG}")`, "list-style-type": "disc" },
          [txt("• ", { x: 0, y: 0, w: 10, h: 18 })],
        ),
        txt("Item", { x: 10, y: 0, w: 30, h: 18 }),
      ]),
    );
    expect(diags(nodes)).toContainEqual(
      expect.objectContaining({ level: "approximated", feature: "list-style-image" }),
    );
  });
});
