import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
/**
 * Flex alignment and direction in visual terms: reverse/RTL packing, text alignment,
 * unbreakable words, align-self and auto margins. Hand-built layout docs, as in infer.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { crossAlign, distributionOf } from "../../../src/analysis/alignment.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { SemNode, TextNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };

function el(
  tag: string,
  bounds: Rect,
  styles: Record<string, string>,
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
): LayoutNode {
  return {
    tag,
    attrs,
    styles: { ...INHERITED, ...styles },
    bounds,
    children,
    ...(attrs["id"] ? { id: attrs["id"] } : {}),
  };
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

const BOX = { x: 0, y: 0, w: 300, h: 40 };

describe("direction", () => {
  const packing: [string, string, string, string][] = [
    // flex-direction, direction, justify-content, visual side (Chrome, 2026-10-10)
    ["row-reverse", "ltr", "flex-end", "start"],
    ["row-reverse", "ltr", "flex-start", "end"],
    ["row-reverse", "ltr", "normal", "end"],
    ["row-reverse", "ltr", "start", "start"],
    ["row", "rtl", "flex-end", "start"],
    ["row", "rtl", "normal", "end"],
    ["row", "rtl", "start", "end"],
    ["row", "rtl", "end", "start"],
    ["row", "rtl", "left", "start"],
    ["row", "rtl", "right", "end"],
    ["row-reverse", "rtl", "flex-end", "end"],
    ["column-reverse", "ltr", "flex-end", "start"],
    ["column-reverse", "ltr", "normal", "end"],
    ["column-reverse", "ltr", "start", "start"],
    ["column", "ltr", "right", "start"],
    ["row", "ltr", "center", "center"],
    ["row-reverse", "ltr", "space-between", "between"],
  ];
  for (const [fd, dir, jc, side] of packing) {
    test(`justify-content ${jc} in ${fd}/${dir} packs at ${side}`, () => {
      expect(
        distributionOf(
          el("div", BOX, { display: "flex", "flex-direction": fd, direction: dir, "justify-content": jc }),
        ),
      ).toBe(side as never);
    });
  }

  const cross: [string, string, string, string][] = [
    ["column", "rtl", "flex-start", "end"],
    ["column", "rtl", "start", "end"],
    ["column", "rtl", "flex-end", "start"],
    ["column", "rtl", "end", "start"],
    ["column", "rtl", "center", "center"],
    ["row", "rtl", "flex-start", "start"],
  ];
  for (const [fd, dir, ai, side] of cross) {
    test(`align-items ${ai} in ${fd}/${dir} sits at ${side}`, () => {
      expect(
        crossAlign(el("div", BOX, { display: "flex", "flex-direction": fd, direction: dir, "align-items": ai })),
      ).toBe(side as never);
    });
  }

  test("a row-reverse row packed at flex-end sits at the visual start", () => {
    const r = el(
      "div",
      BOX,
      { display: "flex", "flex-direction": "row-reverse", "justify-content": "flex-end" },
      [
        el("div", { x: 50, y: 0, w: 50, h: 40 }, { display: "block" }, [], { id: "a" }),
        el("div", { x: 0, y: 0, w: 50, h: 40 }, { display: "block" }, [], { id: "b" }),
      ],
      { id: "r" },
    );
    const screen = inferScreen(doc(el("main", BOX, { display: "block" }, [r])), "t");
    const stack = flatten(screen.root).find((n) => n.id === "r");
    if (stack?.kind !== "stack") throw new Error("expected #r stack");
    expect(stack.distribution).toBe("start");
    expect(stack.leadInset ?? 0).toBe(0);
  });
});

/** The TextNode a leaf host becomes, inside a block `main` as wide as it. */
function leafText(host: LayoutNode): TextNode {
  const screen = inferScreen(
    doc(el("main", { x: 0, y: 0, w: host.bounds.w, h: host.bounds.h }, { display: "block" }, [host])),
    "t",
  );
  const t = flatten(screen.root).find((n) => n.kind === "text");
  if (t?.kind !== "text") throw new Error("expected a text node");
  return t;
}

describe("text alignment", () => {
  test("-webkit-center (<center>, align=center) centres the text", () => {
    const t = leafText(
      el("div", { x: 0, y: 0, w: 200, h: 20 }, { display: "block", "text-align": "-webkit-center" }, [
        textNode("Hi", { x: 90, y: 3, w: 20, h: 14 }),
      ]),
    );
    expect(t.align).toBe("center");
  });

  test("-webkit-right aligns trailing", () => {
    const t = leafText(
      el("div", { x: 0, y: 0, w: 200, h: 20 }, { display: "block", "text-align": "-webkit-right" }, [
        textNode("Hi", { x: 180, y: 3, w: 20, h: 14 }),
      ]),
    );
    expect(t.align).toBe("trailing");
  });

  test("a flex column's justify-content centres vertically, not horizontally", () => {
    const t = leafText(
      el(
        "div",
        { x: 0, y: 0, w: 200, h: 100 },
        { display: "flex", "flex-direction": "column", "justify-content": "center" },
        [textNode("Hi", { x: 0, y: 43, w: 20, h: 14 })],
      ),
    );
    expect(t.align).toBe("leading");
    expect(t.padding).toEqual([0, 0, 0, 0]);
  });

  test("a flex column's align-items centres horizontally; the text stays at the top", () => {
    const t = leafText(
      el(
        "div",
        { x: 0, y: 0, w: 200, h: 100 },
        { display: "flex", "flex-direction": "column", "align-items": "center" },
        [textNode("Hi", { x: 90, y: 0, w: 20, h: 14 })],
      ),
    );
    expect(t.align).toBe("center");
    expect(t.padding).toEqual([0, 0, 80, 0]);
  });

  test("a td with vertical-align: middle keeps its text vertically centred", () => {
    const t = leafText(
      el("td", { x: 0, y: 0, w: 200, h: 60 }, { display: "table-cell", "vertical-align": "middle" }, [
        textNode("Hi", { x: 0, y: 23, w: 20, h: 14 }),
      ]),
    );
    expect(t.padding).toEqual([0, 0, 0, 0]);
  });

  test("block text in a taller box stays at the top", () => {
    const t = leafText(
      el("p", { x: 0, y: 0, w: 200, h: 30 }, { display: "block", "min-height": "30px" }, [
        textNode("Hi", { x: 0, y: 3, w: 20, h: 14 }),
      ]),
    );
    expect(t.padding).toEqual([0, 0, 10, 0]);
  });

  test("a flex row aligned to flex-end puts the surplus above the text", () => {
    const t = leafText(
      el("div", { x: 0, y: 0, w: 200, h: 60 }, { display: "flex", "align-items": "flex-end" }, [
        textNode("Hi", { x: 0, y: 43, w: 20, h: 14 }),
      ]),
    );
    expect(t.padding).toEqual([40, 0, 0, 0]);
  });
});

/** `main > div(nowrap flex row, overflow-x hidden) > span#c(block, padded) > #text`. */
function chipDoc(text: string, styles: Record<string, string> = {}, h = 28, glyphH = 14): LayoutDoc {
  const span = el(
    "span",
    { x: 0, y: 0, w: 60, h },
    {
      display: "block",
      "padding-top": "4px",
      "padding-bottom": "4px",
      "padding-left": "12px",
      "padding-right": "12px",
      ...styles,
    },
    [textNode(text, { x: 12, y: 7, w: 36, h: glyphH })],
    { id: "c" },
  );
  const row = el("div", { x: 0, y: 0, w: 120, h }, { display: "flex", "flex-wrap": "nowrap", "overflow-x": "hidden" }, [
    span,
  ]);
  return doc(el("main", { x: 0, y: 0, w: 120, h }, { display: "block" }, [row]));
}

function chipText(d: LayoutDoc): TextNode {
  const t = flatten(inferScreen(d, "t").root).find((n) => n.kind === "text");
  if (t?.kind !== "text") throw new Error("expected a text node");
  return t;
}

describe("unbreakable words", () => {
  test("a single word never soft-wraps in app mode", () => {
    const d = chipDoc("Design");
    expect(chipText(d).unbreakable).toBe(true);
    const code = compileLayout(d, { name: "Chip", mode: "app" }).code;
    const at = code.indexOf('Text(verbatim: "Design")');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(code.slice(at, code.indexOf(".fixedSize(", at) + 60)).toContain(
      ".fixedSize(horizontal: true, vertical: true)",
    );
  });

  test("words with a space between them can wrap", () => {
    expect(chipText(chipDoc("Get started")).unbreakable).toBeUndefined();
  });

  test("space-free scripts break between characters", () => {
    expect(chipText(chipDoc("設計")).unbreakable).toBeUndefined();
  });

  test("overflow-wrap and word-break that break inside words keep wrapping", () => {
    expect(chipText(chipDoc("Design", { "overflow-wrap": "anywhere" })).unbreakable).toBeUndefined();
    expect(chipText(chipDoc("Design", { "word-break": "break-all" })).unbreakable).toBeUndefined();
  });

  test("a word the browser did break stays measured", () => {
    const d = chipDoc("Design", { "padding-top": "0px", "padding-bottom": "0px" }, 40, 34);
    const t = chipText(d);
    expect(t.lines).toBe(2);
    expect(t.unbreakable).toBeUndefined();
  });
});

/** `main(block) > host`, inferred; the node with `id`. */
function inferred(host: LayoutNode, id: string): { doc: LayoutDoc; node: SemNode } {
  const d = doc(el("main", { x: 0, y: 0, w: host.bounds.w, h: host.bounds.h }, { display: "block" }, [host]));
  const node = flatten(inferScreen(d, "t").root).find((n) => n.id === id);
  if (!node) throw new Error(`expected #${id}`);
  return { doc: d, node };
}

const RED = { "background-color": "rgb(255, 0, 0)" };
const BLUE = { "background-color": "rgb(0, 0, 255)" };

describe("align-self", () => {
  test("align-self: flex-end in a flex-start row sits at the bottom", () => {
    const row = el(
      "div",
      { x: 0, y: 0, w: 300, h: 40 },
      { display: "flex", "align-items": "flex-start" },
      [
        el("div", { x: 0, y: 0, w: 50, h: 40 }, { display: "block", ...RED }, [], { id: "a" }),
        el("div", { x: 60, y: 20, w: 50, h: 20 }, { display: "block", "align-self": "flex-end", ...BLUE }, [], {
          id: "b",
        }),
      ],
      { id: "row" },
    );
    const { doc: d, node: b } = inferred(row, "b");
    expect(b.selfAlignV).toBe("end");
    expect(inferred(row, "a").node.selfAlignV).toBeUndefined();
    expect(compileLayout(d, { name: "Row", mode: "app" }).code).toContain(
      ".frame(maxHeight: .infinity, alignment: .bottom)",
    );
    const fidelity = compileLayout(d, { name: "Row", mode: "fidelity" }).code;
    expect(fidelity).toContain(".padding(.top, 20.0)");
    expect(fidelity).not.toContain("maxHeight: .infinity, alignment: .bottom");
  });

  test("align-self: center in a stretch row is centred, not stretched", () => {
    const row = el(
      "div",
      { x: 0, y: 0, w: 300, h: 40 },
      { display: "flex" },
      [
        el("div", { x: 0, y: 0, w: 50, h: 40 }, { display: "block", ...RED }, [], { id: "a" }),
        el("div", { x: 60, y: 10, w: 50, h: 20 }, { display: "block", "align-self": "center", ...BLUE }, [], {
          id: "b",
        }),
      ],
      { id: "row" },
    );
    const { doc: d, node: b } = inferred(row, "b");
    expect(b.selfAlignV).toBe("center");
    expect(b.height.kind).not.toBe("fill");
    expect(compileLayout(d, { name: "Row", mode: "fidelity" }).code).toContain(".padding(.top, 10.0)");
  });

  test("align-self: center in a stretch column centres horizontally", () => {
    const col = el(
      "div",
      { x: 0, y: 0, w: 300, h: 100 },
      { display: "flex", "flex-direction": "column", "align-items": "stretch" },
      [
        el("div", { x: 125, y: 0, w: 50, h: 20 }, { display: "block", "align-self": "center", ...BLUE }, [], {
          id: "c",
        }),
      ],
    );
    const { doc: d, node: c } = inferred(col, "c");
    expect(c.selfAlign).toBe("center");
    expect(c.width.kind).not.toBe("fill");
    expect(compileLayout(d, { name: "Col", mode: "app" }).code).toContain(
      ".frame(maxWidth: .infinity, alignment: .center)",
    );
  });

  test("align-self: flex-start in an RTL column sits at the right", () => {
    const col = el(
      "div",
      { x: 0, y: 0, w: 300, h: 100 },
      { display: "flex", "flex-direction": "column", direction: "rtl" },
      [
        el("div", { x: 250, y: 0, w: 50, h: 20 }, { display: "block", "align-self": "flex-start", ...BLUE }, [], {
          id: "c",
        }),
      ],
    );
    expect(inferred(col, "c").node.selfAlign).toBe("end");
  });

  test("align-self: baseline outside a baseline row is reported", () => {
    const row = el("div", { x: 0, y: 0, w: 300, h: 40 }, { display: "flex", "align-items": "flex-start" }, [
      el("div", { x: 0, y: 0, w: 50, h: 40 }, { display: "block", ...RED }),
      el("div", { x: 60, y: 0, w: 50, h: 20 }, { display: "block", "align-self": "baseline", ...BLUE }, [], {
        id: "b",
      }),
    ]);
    expect(
      inferred(row, "b").node.diagnostics.some((x) => x.feature === "align-self" && x.level === "approximated"),
    ).toBe(true);
  });

  test("a margin-centred block child still centres", () => {
    const host = el("div", { x: 0, y: 0, w: 300, h: 40 }, { display: "block" }, [
      el(
        "div",
        { x: 50, y: 0, w: 200, h: 40 },
        { display: "block", "margin-left": "50px", "margin-right": "50px", ...BLUE },
        [],
        { id: "m" },
      ),
    ]);
    expect(inferred(host, "m").node.selfAlign).toBe("center");
  });
});

/** A painted block flex item, optionally with Typed-OM auto margins. */
function item(
  id: string,
  bounds: Rect,
  styles: Record<string, string> = {},
  autoMargins?: ("top" | "right" | "bottom" | "left")[],
): LayoutNode {
  return {
    ...el("div", bounds, { display: "block", ...RED, ...styles }, [], { id }),
    ...(autoMargins ? { preferredSize: { width: "auto", height: "auto", autoMargins } } : {}),
  };
}

describe("auto margins", () => {
  test("ml-auto in a navbar becomes a Spacer whose minimum is the CSS gap", () => {
    const nav = {
      ...el(
        "nav",
        { x: 0, y: 0, w: 300, h: 20 },
        { display: "flex", "column-gap": "8px" },
        [
          item("a", { x: 0, y: 0, w: 40, h: 20 }),
          item("b", { x: 262, y: 0, w: 38, h: 20 }, { "margin-left": "214px" }, ["left"]),
        ],
        { id: "n" },
      ),
      preferredSize: { width: "300px", height: "auto" },
    };
    const { doc: d, node: n } = inferred(nav, "n");
    if (n.kind !== "stack") throw new Error("expected #n stack");
    expect(n.autoGaps).toEqual([1]);
    expect(n.spacing).toBe(8);
    const code = compileLayout(d, { name: "Nav", mode: "app" }).code;
    expect(code).toContain("Spacer(minLength: 8.0)");
    expect(code).not.toContain(".padding(.leading, 222.0)");
  });

  test("mt-auto in a column pushes the last child to the bottom", () => {
    const col = {
      ...el(
        "div",
        { x: 0, y: 0, w: 200, h: 300 },
        { display: "flex", "flex-direction": "column" },
        [
          item("t", { x: 0, y: 0, w: 200, h: 20 }),
          item("btn", { x: 0, y: 270, w: 200, h: 30 }, { "margin-top": "250px" }, ["top"]),
        ],
        { id: "col" },
      ),
      preferredSize: { width: "200px", height: "300px" },
    };
    const { doc: d, node: n } = inferred(col, "col");
    if (n.kind !== "stack") throw new Error("expected #col stack");
    expect(n.autoGaps).toEqual([1]);
    const code = compileLayout(d, { name: "Col", mode: "app" }).code;
    expect(code.slice(code.indexOf("VStack"))).toContain("Spacer(minLength: 0.0)");
  });

  test("ml-auto on the first child replaces the leading inset", () => {
    const nav = {
      ...el(
        "nav",
        { x: 0, y: 0, w: 300, h: 20 },
        { display: "flex" },
        [item("a", { x: 250, y: 0, w: 50, h: 20 }, { "margin-left": "250px" }, ["left"])],
        { id: "n" },
      ),
      preferredSize: { width: "300px", height: "auto" },
    };
    const n = inferred(nav, "n").node;
    if (n.kind !== "stack") throw new Error("expected #n stack");
    expect(n.autoGaps).toEqual([0]);
    expect(n.leadInset).toBe(0);
  });

  test("an auto vertical margin in block flow is no Spacer", () => {
    const host = {
      ...el(
        "div",
        { x: 0, y: 0, w: 200, h: 100 },
        { display: "block" },
        [item("t", { x: 0, y: 0, w: 200, h: 20 }), item("b", { x: 0, y: 20, w: 200, h: 20 }, {}, ["top"])],
        { id: "blk" },
      ),
      preferredSize: { width: "200px", height: "100px" },
    };
    const n = inferred(host, "blk").node;
    if (n.kind !== "stack") throw new Error("expected #blk stack");
    expect(n.autoGaps).toBeUndefined();
  });

  test("space-between keeps the CSS gap as the Spacers' minimum", () => {
    const row = {
      ...el(
        "div",
        { x: 0, y: 0, w: 300, h: 20 },
        { display: "flex", "justify-content": "space-between", "column-gap": "16px" },
        [item("a", { x: 0, y: 0, w: 40, h: 20 }), item("b", { x: 260, y: 0, w: 40, h: 20 })],
        { id: "r" },
      ),
      preferredSize: { width: "300px", height: "auto" },
    };
    const { doc: d, node: n } = inferred(row, "r");
    if (n.kind !== "stack") throw new Error("expected #r stack");
    expect(n.minGap).toBe(16);
    expect(compileLayout(d, { name: "Between", mode: "app" }).code).toContain("Spacer(minLength: 16.0)");
  });
});
