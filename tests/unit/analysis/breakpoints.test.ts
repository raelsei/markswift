/** Plan 054: per-band screens compose into one tree; only elements whose authored inputs differ become holders. */
import { expect, test } from "bun:test";
import { planBands } from "../../../src/analysis/bands.ts";
import { bandEdges, mergeBands } from "../../../src/analysis/breakpoints.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import type { SemNode } from "../../../src/model/semantic.ts";
import { band, el, fieldGroupDocs, txt } from "../../helpers/bands.ts";

const merge = (docs: LayoutDoc[]) =>
  mergeBands(
    docs,
    docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`)),
  );
const kids = (n: SemNode) => (n.kind === "stack" || n.kind === "grid" ? n.children : []);
const holders = (n: SemNode, out: string[] = []): string[] => {
  if (n.alternatives) out.push(n.id);
  for (const c of [...kids(n), ...(n.alternatives ?? [])]) holders(c, out);
  return out;
};
const W = [390, 834];

test("1: fluid differences only (bounds, margin-left without a conditional rule) → no merge", () => {
  const docs = W.map((w) =>
    band(w, [
      el("a", "div", { x: 16, y: 0, w: w - 32, h: 20 }, { "margin-left": `${w / 20}px` }, [txt("hello", w - 32)]),
    ]),
  );
  expect(merge(docs)).toBeUndefined();
});

test("2: a child present in band 1 only makes its parent a holder; everything else stays band 0's", () => {
  const docs = W.map((w) =>
    band(w, [
      el("head", "header", { x: 0, y: 0, w, h: 20 }, {}, [txt("Title", w)]),
      el("s", "section", { x: 0, y: 20, w, h: 40 }, {}, [
        el("a", "p", { x: 0, y: 20, w, h: 20 }, {}, [txt("A", w)]),
        ...(w > 600 ? [el("wide", "div", { x: 0, y: 40, w, h: 20 }, {}, [txt("Only wide", w)])] : []),
      ]),
    ]),
  );
  const screens = docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`));
  const merged = mergeBands(docs, screens)!;
  expect(holders(merged.root)).toEqual(["s"]);
  const root = merged.root as SemNode & { children: SemNode[] };
  expect(root.children[0]).toBe(kids(screens[0]!.root)[0]!);
  const s = root.children[1]!;
  expect(s.alternatives!.map((a) => a.bands)).toEqual([[0], [1]]);
  const s1 = kids(screens[1]!.root)[1]!;
  expect(kids(s.alternatives![1]!)).toEqual(kids(s1));
  expect(kids(s.alternatives![1]!)[0]).toBe(kids(s1)[0]!);
  expect(merged.warnings).toEqual([]);
});

test("3: a conditional flex-direction change → holder at that node only", () => {
  const docs = W.map((w) =>
    band(w, [
      el(
        "row",
        "div",
        { x: 0, y: 0, w, h: 40 },
        { display: "flex", "flex-direction": w > 600 ? "row" : "column" },
        [
          el("x", "div", { x: 0, y: 0, w: w > 600 ? w / 2 : w, h: 20 }, {}, [txt("X", 20)]),
          el("y", "div", { x: w > 600 ? w / 2 : 0, y: w > 600 ? 0 : 20, w: w > 600 ? w / 2 : w, h: 20 }, {}, [
            txt("Y", 20),
          ]),
        ],
        { conditional: [0] },
      ),
    ]),
  );
  const merged = merge(docs)!;
  expect(holders(merged.root)).toEqual(["row"]);
});

test("4: a conditional padding change → holder; the same change without a conditional rule → none", () => {
  const docs = (conditional: boolean) =>
    W.map((w) =>
      band(w, [
        el(
          "p",
          "div",
          { x: 0, y: 0, w, h: 20 },
          { "padding-left": w > 600 ? "32px" : "8px" },
          [txt("Pad", w)],
          conditional ? { conditional: [0] } : {},
        ),
      ]),
    );
  expect(holders(merge(docs(true))!.root)).toEqual(["p"]);
  expect(merge(docs(false))).toBeUndefined();
});

test("5: bands 0 and 2 equal, band 1 different → members [0, 2] and [1]", () => {
  const widths = [390, 700, 1100];
  const conditions = [
    { kind: "media" as const, query: "(min-width: 600px)", matches: false },
    { kind: "media" as const, query: "(min-width: 1000px)", matches: false },
  ];
  const docs = widths.map((w) =>
    band(
      w,
      [
        el(
          "x",
          "p",
          { x: 0, y: 0, w, h: 20 },
          { color: w === 700 ? "rgb(255, 0, 0)" : "rgb(0, 0, 0)" },
          [txt("X", w)],
          {
            conditional: [0],
          },
        ),
      ],
      conditions,
    ),
  );
  const merged = merge(docs)!;
  const x = kids(merged.root)[0]!;
  expect(x.alternatives!.map((a) => a.bands)).toEqual([[0, 2], [1]]);
});

test("6: same id, different tag (script insert) → the root is a holder and one breakpoint warning names it", () => {
  const docs = W.map((w) =>
    band(w, [
      w > 600
        ? el("root/0", "header", { x: 0, y: 0, w, h: 20 }, {}, [txt("Wide header", w)])
        : el("root/0", "p", { x: 0, y: 0, w, h: 20 }, {}, [txt("intro", w)]),
      el("root/1", "p", { x: 0, y: 20, w, h: 20 }, {}, [txt(w > 600 ? "intro" : "after", w)]),
    ]),
  );
  const merged = merge(docs)!;
  expect(merged.root.alternatives!.map((a) => a.bands)).toEqual([[0], [1]]);
  expect(merged.warnings).toHaveLength(1);
  expect(merged.warnings[0]).toMatchObject({ source: "breakpoints", feature: "media-query", level: "approximated" });
  expect(merged.warnings[0]!.message).toContain("script-driven DOM differs between viewports under root");
});

test("7: a node inference drops in band 1 only (invisible overlay) → its parent is the holder", () => {
  const docs = W.map((w) =>
    band(w, [
      el("p", "div", { x: 0, y: 0, w, h: 40 }, { position: "relative" }, [
        el("t", "p", { x: 0, y: 0, w, h: 20 }, {}, [txt("Text", w)]),
        el(
          "dot",
          "div",
          { x: 4, y: 4, w: 8, h: 8 },
          { position: "absolute", "background-color": "rgb(255, 0, 0)", opacity: w > 600 ? "0" : "1" },
          [],
          { conditional: [0] },
        ),
      ]),
    ]),
  );
  const merged = merge(docs)!;
  expect(holders(merged.root)).toEqual(["p"]);
  expect(kids(merged.root)[0]!.alternatives!.map((a) => a.bands)).toEqual([[0], [1]]);
});

test("8: a container with synthesized /row children is atomic: holder by deep, rows not aligned", () => {
  const item = (id: string, x: number, y: number, color: string, conditional = false) =>
    el(
      id,
      "span",
      { x, y, w: 60, h: 20 },
      { display: "inline-block", color },
      [txt(id, 60)],
      conditional ? { conditional: [0] } : {},
    );
  const docs = W.map((w) =>
    band(w, [
      el("c", "div", { x: 0, y: 0, w, h: 40 }, {}, [
        item("a", 0, 0, w > 600 ? "rgb(255, 0, 0)" : "rgb(0, 0, 0)", true),
        item("b", 60, 0, "rgb(0, 0, 0)"),
        item("d", 0, 20, "rgb(0, 0, 0)"),
      ]),
    ]),
  );
  const screens = docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`));
  expect(kids(kids(screens[0]!.root)[0]!).map((c) => c.id)).toContain("c/row0");
  const merged = mergeBands(docs, screens)!;
  expect(holders(merged.root)).toEqual(["c"]);
});

test("9: bandEdges subtracts the root's offset from the viewport, refuses fixed roots and unsorted variants", () => {
  const at = (w: number, root: Partial<LayoutNode>) => {
    const d = band(w, []);
    return { ...d, root: { ...d.root, ...root } };
  };
  const centred = [
    at(390, {}),
    at(834, {
      bounds: { x: 67, y: 0, w: 700, h: 100 },
      styles: { display: "block", "margin-left": "67px", "margin-right": "67px" },
    }),
  ];
  expect(bandEdges(centred)).toEqual({
    edges: [{ px: 600, inclusive: true }],
    cssEdges: [{ px: 600, inclusive: true }],
    bands: [0, 1],
  });
  const padded = [390, 834].map((w) => at(w, { bounds: { x: 16, y: 0, w: w - 32, h: 100 } }));
  expect(bandEdges(padded)).toEqual({
    edges: [{ px: 568, inclusive: true }],
    cssEdges: [{ px: 600, inclusive: true }],
    bands: [0, 1],
  });
  const fixed = [390, 834].map((w) => at(w, { bounds: { x: 0, y: 0, w: 393, h: 100 } }));
  const r = bandEdges(fixed);
  expect("warning" in r && r.warning).toContain("the root does not follow the viewport width");
  expect(() => bandEdges([centred[1]!, centred[0]!])).toThrow(
    "options.variants must be one capture per width band in ascending order",
  );
});

test("10: layers and open states (band 0 only) are ignored", () => {
  const docs = (pressed: boolean) =>
    W.map((w) => {
      const states = {
        ...(pressed ? { pressed: { "background-color": "rgb(1, 2, 3)" } } : {}),
        ...(w < 600 ? { open: { color: "rgb(255, 0, 0)" } } : {}),
      };
      const d = band(w, [
        el("menu", "button", { x: 0, y: 0, w: 80, h: 20 }, {}, [txt("Menu", 80)], {
          ...(Object.keys(states).length ? { states } : {}),
        }),
      ]);
      if (w > 600) return d;
      const layer = {
        id: "menu",
        trigger: "menu",
        activation: "click" as const,
        relation: "aria-controls" as const,
        modal: false,
        placement: "viewport" as const,
        nodes: [],
        dismiss: { escape: true, outside: true, buttons: [] },
      };
      return { ...d, layers: [layer] };
    });
  expect(merge(docs(false))).toBeUndefined();
  expect(merge(docs(true))).toBeUndefined();
});

test("11: equal authored inputs but a band-dependent used height (bp-pagination's Next item) → that node is a holder", () => {
  // Band 0's item is 35 tall around a 32 pt child (an inline-flex baseline strut), band 1's hugs it.
  const docs = W.map((w) =>
    band(w, [
      el("li", "div", { x: 0, y: 0, w: 80, h: w > 600 ? 32 : 35 }, { display: "flex", "align-items": "flex-start" }, [
        el("a", "div", { x: 0, y: 0, w: 80, h: 32 }, { "padding-left": w > 600 ? "11px" : "7px" }, [txt("Next", 60)], {
          conditional: [0],
        }),
      ]),
    ]),
  );
  const screens = docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`));
  expect(screens.map((s) => kids(s.root)[0]!.height)).toEqual([{ kind: "fixed", px: 35 }, { kind: "hug" }]);
  const li = kids(mergeBands(docs, screens)!.root)[0]!;
  expect(li.alternatives!.map((a) => a.height)).toEqual([{ kind: "fixed", px: 35 }, { kind: "hug" }]);
});

// Plan 057: query containers. Captures 390/767/834/1376 sit in viewport bands 0, 0, 1, 1.
const VIEWPORT = [0, 0, 1, 1];
const mergeAt = (docs: LayoutDoc[], bands = VIEWPORT) =>
  mergeBands(
    docs,
    docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`)),
    bands,
  );
const find = (n: SemNode, id: string): SemNode | undefined =>
  n.id === id ? n : [...kids(n), ...(n.alternatives ?? [])].map((c) => find(c, id)).find(Boolean);
const hosts = (n: SemNode, out: string[] = []): string[] => {
  if (n.containerBands) out.push(n.id);
  for (const c of [...kids(n), ...(n.alternatives ?? [])]) hosts(c, out);
  return out;
};

test("057/1: a field switching at its group's 448px content width → a holder inside the host, container bands", () => {
  const merged = mergeAt(fieldGroupDocs())!;
  expect(hosts(merged.root)).toEqual(["group"]);
  expect(holders(merged.root)).toEqual(["field"]);
  const group = find(merged.root, "group")!;
  expect(group.containerBands).toEqual({ edges: [{ px: 448, inclusive: true }], names: ["", "cq_md"] });
  const field = kids(group)[0]!;
  expect(field.alternatives!.map((a) => a.bands)).toEqual([[0], [1]]);
  expect(field.alternatives!.map((a) => a.kind === "stack" && a.axis)).toEqual(["v", "h"]);
  expect(merged.warnings).toEqual([]);
});

test("057/2: a host 280px wide at every capture → no container bands, one 'never crosses' warning", () => {
  const merged = mergeAt(fieldGroupDocs({ side: true }))!;
  expect(hosts(merged.root)).toEqual(["group"]);
  expect(merged.warnings).toEqual([
    {
      source: "breakpoints",
      level: "approximated",
      feature: "container-query",
      message:
        "@container (width >= 28rem) on side: the container is 280–280px wide at every captured width and never crosses 448px; add a device width where it does (breakpoints devices)",
    },
  ]);
});

test("057/3: a media-only difference at one container band → 'both restyle', the lower capture's content kept", () => {
  const merged = mergeAt(fieldGroupDocs({ wideColor: "rgb(255, 0, 0)" }))!;
  expect(hosts(merged.root)).toEqual(["group"]);
  const row = find(merged.root, "field")!.alternatives![1]!;
  const label = kids(row)[0]!;
  expect(label.kind === "text" && label.runs.map((r) => r.color)).toEqual([{ r: 0, g: 0, b: 0, a: 1 }]);
  expect(merged.warnings.map((w) => w.message)).toEqual([
    "group: container and media queries both restyle its content at the same container width; the container query is reconstructed, the media difference is not",
  ]);
});

test("057/3b: 'both restyle' ignores a size-following transform-origin, not a media grid-template-columns", () => {
  const withField = (styles: (w: number, field: LayoutNode) => Record<string, string>) =>
    fieldGroupDocs().map((d) => {
      const set = (n: LayoutNode): LayoutNode =>
        n.id === "field"
          ? { ...n, styles: { ...n.styles, ...styles(d.viewport.w, n) } }
          : { ...n, children: n.children.map(set) };
      return { ...d, root: set(d.root) };
    });
  // The default 50% 50% origin resolves to half the field's used width: 767/834/1376 share container band 1.
  const origin = mergeAt(withField((_, field) => ({ "transform-origin": `${field.bounds.w / 2}px 18px` })))!;
  expect(hosts(origin.root)).toEqual(["group"]);
  expect(origin.warnings).toEqual([]);
  const columns = mergeAt(withField((w) => ({ "grid-template-columns": w >= 768 ? "100px 200px" : "none" })))!;
  expect(columns.warnings.map((w) => w.message)).toEqual([
    "group: container and media queries both restyle its content at the same container width; the container query is reconstructed, the media difference is not",
  ]);
});

test("057/4: a query container that is a text node → reported, not reconstructed", () => {
  const docs = [390, 767].map((w) =>
    band(
      w,
      [
        el("t", "p", { x: 0, y: 0, w: w - 32, h: 20 }, {}, [
          el(
            "t/s",
            "span",
            { x: 0, y: 0, w: 40, h: 20 },
            { display: "inline", color: w > 600 ? "rgb(255, 0, 0)" : "rgb(0, 0, 0)" },
            [txt("hi", 40)],
            { conditional: [0] },
          ),
        ]),
      ],
      [{ kind: "container", query: "(width >= 28rem)", container: "t", matches: w > 600 }],
    ),
  );
  const screens = docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`));
  expect(screens[0]!.root.kind === "stack" && screens[0]!.root.children[0]!.kind).toBe("text");
  const merged = mergeBands(docs, screens, [0, 0])!;
  expect(merged.root).toBe(screens[0]!.root);
  expect(merged.warnings.map((w) => w.message)).toEqual([
    "@container (width >= 28rem) on t: the container is not a stack or grid (or scrolls); the query is not reconstructed",
  ]);
});

test("057/5: media-only docs merge exactly as without explicit bands", () => {
  const docs = W.map((w) =>
    band(w, [
      el(
        "row",
        "div",
        { x: 0, y: 0, w, h: 40 },
        { display: "flex", "flex-direction": w > 600 ? "row" : "column" },
        [el("x", "div", { x: 0, y: 0, w: 20, h: 20 }, {}, [txt("X", 20)])],
        { conditional: [0] },
      ),
    ]),
  );
  const screens = docs.map((d, i) => inferScreen(d, `bp${i ? `@${i}` : ""}-light`));
  const merged = mergeBands(docs, screens, [0, 1])!;
  expect(merged).toEqual(mergeBands(docs, screens)!);
  expect(hosts(merged.root)).toEqual([]);
  expect(merged.warnings).toEqual([]);
});

test("057/6: bandEdges takes two captures in one band only with container queries", () => {
  const docs = fieldGroupDocs();
  expect(bandEdges(docs)).toEqual({
    edges: [{ px: 768, inclusive: true }],
    cssEdges: [{ px: 768, inclusive: true }],
    bands: [0, 0, 1, 1],
  });
  const media = docs.map((d) => ({ ...d, conditions: d.conditions.filter((c) => c.kind === "media") }));
  expect(() => bandEdges(media)).toThrow("options.variants must be one capture per width band in ascending order");
  expect(() => bandEdges([docs[0]!, docs[2]!, docs[1]!])).toThrow("one capture per width band");
});

test("057/7: a host crossing just above a band's lower bound (bp-field-responsive at 768) → container bands there", () => {
  // The planner's captures: the group is 432px wide at 768 but 498px at band 1's device capture (834).
  const plan = planBands(fieldGroupDocs()[0]!.conditions, {
    first: { width: 390, height: 844 },
    devices: [{ width: 834, height: 844 }],
    max: 1376,
  });
  const widths = [...plan.captures, ...plan.extra].map((c) => c.width).sort((a, b) => a - b);
  expect(widths).toEqual([390, 767, 768, 834, 1376]);
  // A parent restyled at 768px (bp-field-responsive's grid columns) composes the host per viewport band.
  const docs = fieldGroupDocs({ widths }).map((d) => ({
    ...d,
    root: {
      ...d.root,
      children: [
        el(
          "grid",
          "div",
          { x: 0, y: 0, w: d.viewport.w, h: d.root.children[0]!.bounds.h },
          { "padding-top": d.viewport.w >= 768 ? "4px" : "0px" },
          d.root.children,
          { conditional: [0] },
        ),
      ],
    },
  }));
  const edges = bandEdges(docs);
  if (!("bands" in edges)) throw new Error(edges.warning);
  const merged = mergeAt(docs, edges.bands)!;
  const grid = find(merged.root, "grid")!;
  expect(grid.alternatives!.map((a) => a.bands)).toEqual([[0], [1]]);
  for (const alt of grid.alternatives!) {
    const group = find(alt, "group")!;
    expect(group.containerBands).toEqual({ edges: [{ px: 448, inclusive: true }], names: ["", "cq_md"] });
    expect(kids(group)[0]!.alternatives!.map((a) => a.kind === "stack" && a.axis)).toEqual(["v", "h"]);
  }
  expect(merged.warnings).toEqual([]);
});
