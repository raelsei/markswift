/** Plan 037: flex rows MarkswiftFlexRow reproduces, admitted only when the solver mirror matches the capture. */
import { expect, test } from "bun:test";
import { admitFlexRow, solveFlexRow } from "../../../src/analysis/flex-row.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import type { SemNode, StackNode } from "../../../src/model/semantic.ts";

const INHERITED = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "16px" };

interface Spec {
  /** Captured border-box width. */
  w: number;
  /** flex-grow, flex-shrink, flex-basis. */
  flex?: [number, number, string];
  /** Typed-OM width. */
  width?: string;
  /** Width of a single text child (its line count from `lines`). */
  text?: number;
  lines?: number;
  pad?: number;
  styles?: Record<string, string>;
}

/** A 340px flex row (gap 8) of `specs`, laid out left to right as captured, inside a block root. */
function flexDoc(specs: Spec[], rowStyles: Record<string, string> = {}, width = 340): LayoutDoc {
  const gap = Number.parseFloat(rowStyles["column-gap"] ?? "8px");
  let x = 0;
  const items: LayoutNode[] = specs.map((s, i) => {
    const [grow, shrink, basis] = s.flex ?? [0, 1, "auto"];
    const pad = s.pad ?? 0;
    const bounds = { x, y: 0, w: s.w, h: 40 };
    x += s.w + gap;
    const text: LayoutNode[] =
      s.text === undefined
        ? []
        : [
            {
              tag: "#text",
              attrs: {},
              styles: { ...INHERITED },
              text: `label ${i}`,
              bounds: { x: bounds.x + pad, y: 12, w: s.text, h: 16 * (s.lines ?? 1) },
              lines: Array.from({ length: s.lines ?? 1 }, (_, l) => ({
                bounds: { x: bounds.x + pad, y: 12 + 16 * l, w: s.text!, h: 16 },
                start: 0,
                length: 7,
              })),
              children: [],
            },
          ];
    return {
      id: `item${i}`,
      tag: "div",
      attrs: {},
      preferredSize: { width: s.width ?? "auto", height: "auto" },
      bounds,
      children: text,
      styles: {
        ...INHERITED,
        display: "block",
        "box-sizing": "border-box",
        "background-color": "rgb(220, 80, 60)",
        "flex-grow": String(grow),
        "flex-shrink": String(shrink),
        "flex-basis": basis,
        "margin-left": "0px",
        "margin-right": "0px",
        order: "0",
        "align-self": "auto",
        "min-width": "auto",
        "max-width": "none",
        "padding-left": `${pad}px`,
        "padding-right": `${pad}px`,
        ...s.styles,
      },
    };
  });
  const row: LayoutNode = {
    id: "row",
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: 0, y: 0, w: width, h: 40 },
    children: items,
    styles: {
      ...INHERITED,
      display: "flex",
      "flex-direction": "row",
      "flex-wrap": "nowrap",
      "align-items": "normal",
      "justify-content": "normal",
      "column-gap": "8px",
      ...rowStyles,
    },
  };
  return {
    version: LAYOUT_DOC_VERSION,
    source: "flex-row.html",
    combo: { screen: "row", theme: "light" },
    size: { w: width, h: 40 },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      bounds: { x: 0, y: 0, w: width, h: 40 },
      children: [row],
      styles: { ...INHERITED, display: "block" },
    },
  };
}

function rowOf(doc: LayoutDoc): StackNode {
  const find = (n: SemNode): StackNode | undefined =>
    n.id === "row" && n.kind === "stack"
      ? n
      : "children" in n && n.children
        ? n.children.map(find).find(Boolean)
        : undefined;
  const row = find(inferScreen(doc, "Row").root);
  if (!row) throw new Error("row stack not found");
  return row;
}

/** Admits through inference: `flex` set, no pinned diagnostics on the children. */
function expectAdmitted(doc: LayoutDoc) {
  const row = rowOf(doc);
  expect(row.flex).toBeDefined();
  const features = row.children.flatMap((c) => c.diagnostics.map((d) => d.feature));
  expect(features.filter((f) => /^(flex-grow|flex-shrink|width)$/.test(f))).toEqual([]);
  return row;
}

/** The false-admission guard: neither the mirror nor inference admits. */
function expectRejected(doc: LayoutDoc) {
  expect(admitFlexRow(doc.root.children[0]!)).toBeUndefined();
  if (doc.root.children[0]!.styles["flex-wrap"] !== "wrap") expect(rowOf(doc).flex).toBeUndefined();
}

const P1: Spec[] = [
  { w: 110.67, flex: [1, 0, "0px"] },
  { w: 221.33, flex: [2, 0, "0px"] },
];
const P3: Spec[] = [
  { w: 123.5, flex: [1, 1, "auto"], text: 35, pad: 12 },
  { w: 208.5, flex: [1, 1, "auto"], text: 120, pad: 12 },
];
const P4: Spec[] = [
  { w: 108, width: "150px" },
  { w: 108, width: "150px" },
  { w: 108, width: "150px" },
];
const P5: Spec[] = [
  { w: 200, width: "200px" },
  { w: 40, text: 40 },
  { w: 50, text: 50 },
];

test("solveFlexRow grows, shrinks by basis weight and clamps at 0", () => {
  const items = (...g: Array<[number, number]>) => g.map(([grow, shrink]) => ({ grow, shrink, basis: 0 }));
  expect(solveFlexRow(items([1, 0], [2, 0]), [0, 0], 340, 8).map(Math.round)).toEqual([111, 221]);
  expect(solveFlexRow(items([0, 1], [0, 1], [0, 1]), [150, 150, 150], 340, 8)).toEqual([108, 108, 108]);
  expect(solveFlexRow(items([0.5, 0]), [100], 300, 0)).toEqual([200]);
  expect(solveFlexRow(items([0, 100], [0, 1]), [10, 300], 100, 0).map(Math.round)).toEqual([0, 252]);
});

test("P1 flex 1 : 2 (basis 0) is admitted with fixed captured widths", () => {
  const row = expectAdmitted(flexDoc(P1));
  expect(row.flex!.items).toEqual([
    { grow: 1, shrink: 0, basis: 0 },
    { grow: 2, shrink: 0, basis: 0 },
  ]);
  expect(row.flex!.align).toBe("stretch");
  expect(row.flex!.fidelityNote?.feature).toBe("flex-grow");
  expect(row.children.map((c) => c.width)).toEqual([
    { kind: "fixed", px: 110.67 },
    { kind: "fixed", px: 221.33 },
  ]);
});

test("P1 with padding: the 0 basis is the padding box, as CSS adds padding to the flex base size", () => {
  const row = expectAdmitted(
    flexDoc([
      { w: 24 + 284 / 3, flex: [1, 0, "0px"], pad: 12 },
      { w: 24 + 568 / 3, flex: [2, 0, "0px"], pad: 12 },
    ]),
  );
  expect(row.flex!.items.map((i) => i.basis)).toEqual([24, 24]);
});

test("P2 a sidebar beside a single grower is not a candidate and stays fill", () => {
  const doc = flexDoc([
    { w: 120, flex: [0, 0, "120px"] },
    { w: 212, flex: [1, 0, "0px"] },
  ]);
  expectRejected(doc);
  expect(rowOf(doc).children[1]!.width).toEqual({ kind: "fill" });
});

test("P3 1 1 auto items take their single-line content as basis", () => {
  const row = expectAdmitted(flexDoc(P3));
  expect(row.flex!.items.map((i) => i.basis)).toEqual([null, null]);
  expect(row.children.map((c) => c.width)).toEqual([
    { kind: "fixed", px: 123.5 },
    { kind: "fixed", px: 208.5 },
  ]);
});

test("P4 three 150px items shrunk to 108 are admitted (C2)", () => {
  const row = expectAdmitted(flexDoc(P4));
  expect(row.flex!.items).toEqual(Array(3).fill({ grow: 0, shrink: 1, basis: 150 }));
  expect(row.flex!.fidelityNote?.feature).toBe("flex-shrink");
  expect(row.children.map((c) => c.width)).toEqual(Array(3).fill({ kind: "fixed", px: 108 }));
});

test("P5 a shrinkable 200px item beside text items is admitted (C3) without a fidelity note", () => {
  const row = expectAdmitted(flexDoc(P5));
  expect(row.flex!.items.map((i) => i.basis)).toEqual([200, null, null]);
  expect(row.flex!.fidelityNote).toBeUndefined();
  expect(row.children[0]!.width).toEqual({ kind: "fixed", px: 200 });
});

const with_ = (specs: Spec[], i: number, styles: Record<string, string>): Spec[] =>
  specs.map((s, j) => (j === i ? { ...s, styles: { ...s.styles, ...styles } } : s));

test("N1 captured widths 2px off the solver are rejected", () =>
  expectRejected(
    flexDoc([
      { w: 112.67, flex: [1, 0, "0px"] },
      { w: 219.33, flex: [2, 0, "0px"] },
    ]),
  ));
test("N2 flex-wrap: wrap is rejected", () => expectRejected(flexDoc(P1, { "flex-wrap": "wrap" })));
test("N3 row-reverse is rejected", () => expectRejected(flexDoc(P1, { "flex-direction": "row-reverse" })));
test("N4 direction: rtl is rejected", () => expectRejected(flexDoc(P1, { direction: "rtl" })));
test("N5 inline-flex is rejected", () => expectRejected(flexDoc(P1, { display: "inline-flex" })));
test("N6 a horizontal item margin is rejected", () => expectRejected(flexDoc(with_(P1, 1, { "margin-left": "8px" }))));
test("N7 order is rejected", () => expectRejected(flexDoc(with_(P1, 0, { order: "1" }))));
test("N8 align-self is rejected", () => expectRejected(flexDoc(with_(P1, 0, { "align-self": "center" }))));
test("N9 a px min-width is rejected", () => expectRejected(flexDoc(with_(P1, 0, { "min-width": "40px" }))));
test("N10 a max-width is rejected", () => expectRejected(flexDoc(with_(P1, 1, { "max-width": "200px" }))));
test("N11 a percentage basis is rejected", () => expectRejected(flexDoc(with_(P1, 0, { "flex-basis": "50%" }))));
test("N12 a percentage width is rejected", () =>
  expectRejected(flexDoc(P4.map((s, i) => (i === 0 ? { ...s, width: "50%" } : s)))));
test("N13 a growing content item whose text wraps has no provable basis", () =>
  expectRejected(flexDoc(P3.map((s, i) => (i === 1 ? { ...s, lines: 2 } : s)))));
test("N14 an anonymous text item is rejected", () => {
  const doc = flexDoc(P1);
  const row = doc.root.children[0]!;
  row.children.push({
    tag: "#text",
    attrs: {},
    styles: { ...INHERITED },
    text: "loose",
    bounds: { x: 340, y: 12, w: 0, h: 16 },
    children: [],
  });
  expectRejected(doc);
});
test("N15 align-items: baseline is rejected", () => expectRejected(flexDoc(P1, { "align-items": "baseline" })));
test("N16 justify-content: center without growers is rejected", () =>
  expectRejected(flexDoc(P5, { "justify-content": "center" })));
test("N17 a missing flex-shrink is rejected", () => {
  const doc = flexDoc(P1);
  for (const c of doc.root.children[0]!.children) delete c.styles["flex-shrink"];
  expectRejected(doc);
});
test("N18 a shrink sum below 1 in a shrinking row is rejected", () =>
  expectRejected(
    flexDoc([
      { w: 87, width: "150px", flex: [0, 0.25, "auto"] },
      { w: 87, width: "150px", flex: [0, 0.25, "auto"] },
      { w: 150, width: "150px", flex: [0, 0, "auto"] },
    ]),
  ));

test("P1 app emits MarkswiftFlexRow; fidelity is byte-identical to the unadmitted row and notes the pin", () => {
  const doc = flexDoc(P1);
  // Without extraction: the subview preview of the two equal items would frame the first's captured width.
  const app = compileLayout(doc, { name: "RowView", mode: "app", extract: false }).code;
  expect(app).toContain(
    "MarkswiftFlexRow(items: [.init(grow: 1.0, shrink: 0.0, basis: 0.0), .init(grow: 2.0, shrink: 0.0, basis: 0.0)], spacing: 8.0) {",
  );
  expect(app).not.toContain(".frame(width: 110.67");
  const plain = structuredClone(doc);
  for (const c of plain.root.children[0]!.children) delete c.styles["flex-shrink"];
  const fidelity = compileLayout(doc, { name: "RowView", mode: "fidelity" });
  expect(fidelity.code).toBe(compileLayout(plain, { name: "RowView", mode: "fidelity" }).code);
  expect(fidelity.diagnostics.flatMap((r) => r.diagnostics)).toContainEqual(
    expect.objectContaining({ feature: "flex-grow", message: expect.stringContaining("MarkswiftFlexRow") }),
  );
});

test("P5 (C3 only) fidelity reports no flex allocation", () => {
  const found = compileLayout(flexDoc(P5), { name: "RowView", mode: "fidelity" }).diagnostics.flatMap(
    (r) => r.diagnostics,
  );
  expect(found.filter((d) => d.feature === "flex-grow" || d.feature === "flex-shrink")).toEqual([]);
});

test("a centred row emits its alignment", () => {
  expect(compileLayout(flexDoc(P4, { "align-items": "center" }), { name: "RowView", mode: "app" }).code).toContain(
    "spacing: 8.0, align: .center) {",
  );
});
