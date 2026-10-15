import { describe, expect, test } from "bun:test";
import { LAYOUT_DOC_VERSION, LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import type { Capture } from "../../../src/browser/capture.ts";
import type { DomSnapshot } from "../../../src/browser/snapshot.ts";
import type { CaptureRequest, Trigger } from "../../../src/input/types.ts";
import { captureLayers, laidOut, layerIds, layerRoots, openDelta, outsidePoint } from "../../../src/browser/layers.ts";

const node = (id: string, extra: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  tag: "div",
  attrs: {},
  styles: {},
  bounds: { x: 0, y: 0, w: 10, h: 10 },
  children: [],
  ...extra,
});

const doc = (layers: unknown) => ({
  version: LAYOUT_DOC_VERSION,
  source: "test",
  combo: { screen: "s", theme: "light" },
  size: { w: 390, h: 100 },
  viewport: { x: 0, y: 0, w: 390, h: 844 },
  dpr: 1,
  fonts: [],
  root: node("root", {
    children: [
      node("0", { tag: "button", states: { open: { "background-color": "rgb(240, 240, 240)" } } }),
      node("1", { tag: "dialog", pseudoStyles: { backdrop: { "background-color": "rgba(0, 0, 0, 0.4)" } } }),
    ],
  }),
  layers,
});

const layer = (id: string) => ({
  id,
  trigger: "0",
  activation: "click",
  relation: "aria-controls",
  modal: true,
  placement: "viewport",
  nodes: [node("edit-profile"), node("edit-profile/1")],
  dismiss: { escape: true, outside: false, buttons: ["#cancel"] },
});

describe("LayoutDoc 4 layers", () => {
  test("parses layers, states.open and pseudoStyles.backdrop", () => {
    const parsed = LayoutDoc.parse(doc([layer("edit-profile")]));
    expect(parsed.layers?.[0]?.nodes).toHaveLength(2);
    expect(parsed.layers?.[0]?.dismiss).toEqual({ escape: true, outside: false, buttons: ["#cancel"] });
    expect(parsed.root.children[0]?.states?.open).toEqual({ "background-color": "rgb(240, 240, 240)" });
    expect(parsed.root.children[1]?.pseudoStyles?.backdrop).toEqual({ "background-color": "rgba(0, 0, 0, 0.4)" });
  });

  test("rejects a layer id that is not a slug", () => {
    expect(() => LayoutDoc.parse(doc([layer("Edit Profile")]))).toThrow();
  });
});

/** One snapshot node: backend id = index + 100; `b` absent = not laid out. */
interface N {
  parent: number;
  name?: string;
  b?: number[];
  opacity?: string;
  paint?: number;
  pseudo?: true;
  open?: true;
}

/** Columnar snapshot in the `ROOTS_ARGS` shape (opacity is the only style). Node 0 is `<html>`. */
function synth(items: N[]): DomSnapshot {
  const strings: string[] = [];
  const S = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const laid = items.flatMap((n, i) => (n.b ? [i] : []));
  const pseudo = items.flatMap((n, i) => (n.pseudo ? [i] : []));
  return {
    documents: [
      {
        documentURL: S("http://x/"),
        nodes: {
          nodeType: items.map(() => 1),
          nodeName: items.map((n) => S(n.name ?? "DIV")),
          nodeValue: items.map(() => -1),
          parentIndex: items.map((n) => n.parent),
          attributes: items.map((n) => (n.open ? [S("open"), S("")] : [])),
          backendNodeId: items.map((_, i) => i + 100),
          pseudoType: { index: pseudo, value: pseudo.map(() => S("before")) },
        },
        layout: {
          nodeIndex: laid,
          styles: laid.map((i) => [S(items[i]!.opacity ?? "1")]),
          bounds: laid.map((i) => items[i]!.b!),
          text: laid.map(() => -1),
          paintOrders: laid.map((i) => items[i]!.paint ?? 0),
        },
        textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] },
      },
    ],
    strings,
  };
}

const BOX = [0, 0, 100, 50];
/** html(0) > body(1) > root(2) > trigger button(3); everything laid out. */
const PAGE: N[] = [
  { parent: -1, b: BOX },
  { parent: 0, b: BOX },
  { parent: 1, b: BOX },
  { parent: 2, b: BOX },
];
const before = laidOut(synth(PAGE));
const none = new Set<number>();

describe("layerRoots", () => {
  test("laidOut reads backend ids of laid-out nodes", () => {
    expect([...laidOut(synth([...PAGE, { parent: 1 }]))]).toEqual([100, 101, 102, 103]);
  });

  test("a portal (new subtree outside the root) is one root", () => {
    const snap = synth([...PAGE, { parent: 1, b: BOX }, { parent: 4, b: BOX }]);
    expect(layerRoots(before, snap, none)).toEqual([104]);
  });

  test("a node that existed without layout and gains it is a root", () => {
    const closed = laidOut(synth([...PAGE, { parent: 2 }]));
    expect(layerRoots(closed, synth([...PAGE, { parent: 2, b: BOX }]), none)).toEqual([104]);
  });

  test("closed <details> content has boxes but is not laid out; opening it makes it a root", () => {
    const details = (open?: true): N[] => [
      ...PAGE,
      { parent: 2, b: BOX, name: "DETAILS", open },
      { parent: 4, b: BOX, name: "SUMMARY" },
      { parent: 4, b: BOX, name: "P" },
      { parent: 6, b: BOX },
    ];
    const closed = laidOut(synth(details()));
    expect([...closed]).toEqual([100, 101, 102, 103, 104, 105]);
    expect(layerRoots(closed, synth(details()), none)).toEqual([]);
    expect(layerRoots(closed, synth(details(true)), none)).toEqual([106]);
  });

  test("a new node inside the trigger is excluded", () => {
    const snap = synth([...PAGE, { parent: 3, b: BOX }]);
    expect(layerRoots(before, snap, new Set([103, 104]))).toEqual([]);
  });

  test("a 0×0 span and an opacity-0 span are dropped (focus guards); pseudo-elements are never roots", () => {
    const snap = synth([
      ...PAGE,
      { parent: 1, b: [0, 0, 0, 0] },
      { parent: 1, b: BOX, opacity: "0" },
      { parent: 3, b: BOX, pseudo: true },
    ]);
    expect(layerRoots(before, snap, none)).toEqual([]);
  });

  test("a zero-size root with a sized descendant is kept (Radix popper wrapper)", () => {
    const snap = synth([...PAGE, { parent: 1, b: [0, 0, 0, 0] }, { parent: 4, b: BOX }]);
    expect(layerRoots(before, snap, none)).toEqual([104]);
  });

  test("two roots come back in paint order", () => {
    const snap = synth([...PAGE, { parent: 1, b: BOX, paint: 9 }, { parent: 1, b: BOX, paint: 4 }]);
    expect(layerRoots(before, snap, none)).toEqual([105, 104]);
  });
});

describe("outsidePoint", () => {
  const viewport = { width: 390, height: 844 };
  test("no rects: the top-left corner", () => {
    expect(outsidePoint([], viewport)).toEqual({ x: 2, y: 2 });
  });
  test("a right sheet covering x ≥ 40: top-left", () => {
    expect(outsidePoint([{ x: 40, y: 0, w: 350, h: 844 }], viewport)).toEqual({ x: 2, y: 2 });
  });
  test("a left sheet: top-right", () => {
    expect(outsidePoint([{ x: 0, y: 0, w: 300, h: 844 }], viewport)).toEqual({ x: 388, y: 2 });
  });
  test("rects covering all four corners: undefined", () => {
    const corners = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 380, y: 0, w: 10, h: 10 },
      { x: 0, y: 834, w: 10, h: 10 },
      { x: 380, y: 834, w: 10, h: 10 },
    ];
    expect(outsidePoint(corners, viewport)).toBeUndefined();
  });
});

describe("openDelta", () => {
  test("keeps changed paint keys only, ignoring non-paint keys", () => {
    expect(
      openDelta(
        { "background-color": "rgb(255, 255, 255)", width: "10px", color: "rgb(0, 0, 0)" },
        { "background-color": "rgb(240, 240, 240)", width: "20px", color: "rgb(0, 0, 0)" },
      ),
    ).toEqual({ "background-color": "rgb(240, 240, 240)" });
  });
  test("equal paint: undefined", () => {
    expect(openDelta({ color: "red", width: "1px" }, { color: "red", width: "2px" })).toBeUndefined();
  });
});

describe("layerIds", () => {
  test("slugs (diacritics dropped, first 4 words), unique with -2, empty → layer", () => {
    expect(layerIds(["Edit profile", "Open", "Open", "Résumé: view all of it", "…", "open-2"])).toEqual([
      "edit-profile",
      "open",
      "open-2",
      "resume-view-all-of",
      "layer",
      "open-2-2",
    ]);
  });
});

describe("captureLayers", () => {
  const spec: CaptureRequest = { screen: "s", theme: "light", url: "http://x/", root: "main" };
  const trigger = (i: number): Trigger => ({ path: String(i), activation: "click", id: `t${i}`, trigger: String(i) });
  const rest = (triggers: Trigger[]): Capture => ({
    warnings: [],
    fontFiles: [],
    triggers,
    layout: LayoutDoc.parse(doc(undefined)),
  });
  const opened = (s: CaptureRequest): Capture => ({
    warnings: [],
    fontFiles: [],
    layout: LayoutDoc.parse(doc(undefined)),
    opened: {
      layer: { ...LayoutDoc.parse(doc([layer("edit-profile")])).layers![0]!, id: s.open!.id, trigger: s.open!.trigger },
      size: { w: 390, h: 100 },
      openPaint: { [s.open!.trigger]: { "background-color": "rgb(240, 240, 240)" } },
    },
  });

  test("no triggers: the capture is never called and layers stay absent", async () => {
    const r = rest([]);
    let calls = 0;
    const shots = await captureLayers(
      async (s) => {
        calls++;
        return opened(s);
      },
      spec,
      r,
      { probeDismiss: true },
    );
    expect([calls, r.layout.layers, shots]).toEqual([0, undefined, {}]);
  });

  test("13 triggers: 12 opened, one warning naming the rest", async () => {
    const r = rest(Array.from({ length: 13 }, (_, i) => trigger(i)));
    const seen: CaptureRequest[] = [];
    await captureLayers(
      async (s) => {
        seen.push(s);
        return { ...opened(s), opened: undefined };
      },
      spec,
      r,
      { probeDismiss: true },
    );
    expect(seen).toHaveLength(12);
    expect(seen[0]).toMatchObject({ open: trigger(0), probeDismiss: true });
    expect(r.warnings.map((w) => w.message)).toEqual([
      "1 open-state trigger(s) beyond the first 12 were not captured: t12",
    ]);
  });

  test("a trigger that opens nothing is skipped; states.open lands on the rest node by id", async () => {
    const r = rest([trigger(0), trigger(1)]);
    const shots = await captureLayers(
      async (s) => (s.open!.id === "t0" ? { ...opened(s), opened: undefined } : opened(s)),
      spec,
      r,
      { probeDismiss: false },
    );
    expect(r.layout.layers?.map((l) => l.id)).toEqual(["t1"]);
    expect(Object.keys(shots)).toEqual(["t1"]);
    expect(r.layout.root.children[1]!.states).toEqual({ open: { "background-color": "rgb(240, 240, 240)" } });
  });
});
