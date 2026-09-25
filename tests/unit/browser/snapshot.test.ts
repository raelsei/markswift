import { describe, expect, test } from "bun:test";
import { STYLE_WHITELIST } from "../../../src/model/layout.ts";
import { attachPreferredSizes, snapshotToTree, srcsetUrls, toLayout, type DomSnapshot } from "../../../src/browser/snapshot.ts";

describe("srcsetUrls", () => {
  test("data URLs keep their comma; descriptors are skipped; bare trailing commas are stripped", () => {
    expect(srcsetUrls("data:image/png;base64,AAA 1x, data:image/png;base64,BBB 2x")).toEqual(["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
    expect(srcsetUrls("a.png, b.png 320w,c.png 2x")).toEqual(["a.png", "b.png", "c.png"]);
    expect(srcsetUrls("")).toEqual([]);
  });
});

/** Builds a columnar snapshot from a nested spec (element = [name, attrs, layout?, children], text = string). */
type Spec = [string, Record<string, string>, { b?: number[]; o?: number[]; text?: string; pseudo?: string; styles?: Record<string, string> } | undefined, Spec[]] | string;

function synth(root: Spec): DomSnapshot {
  const strings: string[] = [];
  const S = (s: string) => {
    const i = strings.indexOf(s);
    if (i >= 0) return i;
    strings.push(s);
    return strings.length - 1;
  };
  const nodes = { nodeType: [] as number[], nodeName: [] as number[], nodeValue: [] as number[], parentIndex: [] as number[], attributes: [] as number[][], pseudoType: { index: [] as number[], value: [] as number[] } };
  const layout = { nodeIndex: [] as number[], styles: [] as number[][], bounds: [] as number[][], text: [] as number[], offsetRects: [] as number[][] };
  const add = (spec: Spec, parent: number): void => {
    const i = nodes.nodeType.length;
    nodes.parentIndex.push(parent);
    if (typeof spec === "string") {
      nodes.nodeType.push(3);
      nodes.nodeName.push(S("#text"));
      nodes.nodeValue.push(S(spec));
      nodes.attributes.push([]);
      layout.nodeIndex.push(i);
      layout.styles.push([]);
      layout.bounds.push([0, 0, 10, 10]);
      layout.text.push(S(spec));
      layout.offsetRects.push([0, 0, 10, 10]);
      return;
    }
    const [name, attrs, lay, children] = spec;
    nodes.nodeType.push(1);
    nodes.nodeName.push(S(name.toUpperCase()));
    nodes.nodeValue.push(-1);
    nodes.attributes.push(Object.entries(attrs).flatMap(([k, v]) => [S(k), S(v)]));
    if (lay?.pseudo) {
      nodes.pseudoType.index.push(i);
      nodes.pseudoType.value.push(S(lay.pseudo));
    }
    if (lay?.b) {
      layout.nodeIndex.push(i);
      layout.styles.push(STYLE_WHITELIST.map((p) => (lay.styles?.[p] !== undefined ? S(lay.styles[p]!) : -1)));
      layout.bounds.push(lay.b);
      layout.text.push(lay.text !== undefined ? S(lay.text) : -1);
      layout.offsetRects.push(lay.o ?? lay.b);
    }
    for (const c of children) add(c, i);
  };
  add(root, -1);
  return { documents: [{ documentURL: S("http://x/"), nodes, layout, textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] } }], strings };
}

const pathIdentity = (_tag: string, _attrs: Record<string, string>, path: string) => path || "root";

describe("toLayout", () => {
  test("size intent follows DOM element paths through pseudo-elements, text and flattened wrappers", () => {
    const snap = synth(["html", {}, undefined, [["main", {}, { b: [0, 0, 200, 100] }, [
      ["style", {}, undefined, []],
      ["::before", {}, { b: [0, 0, 20, 20], pseudo: "before", text: "x" }, []],
      "Text",
      ["div", {}, undefined, [["section", {}, { b: [0, 20, 120, 40] }, []]]],
      ["div", { hidden: "" }, undefined, []],
      ["aside", {}, { b: [0, 60, 80, 40] }, []],
    ]]]]);
    const root = snapshotToTree(snap).children[0]!;
    attachPreferredSizes(root, {
      "": { width: "auto", height: "auto" },
      "0": { width: "auto", height: "auto" },
      "1": { width: "auto", height: "auto" },
      "1/0": { width: "120px", height: "40px" },
      "2": { width: "999px", height: "999px" },
      "3": { width: "80px", height: "40px" },
    });
    const node = toLayout(root, { x: 0, y: 0 }, pathIdentity)!;
    expect(node.preferredSize).toEqual({ width: "auto", height: "auto" });
    expect(node.children.map(child => [child.tag, child.preferredSize])).toEqual([
      ["::before", undefined], ["#text", undefined],
      ["section", { width: "120px", height: "40px" }],
      ["aside", { width: "80px", height: "40px" }],
    ]);
    expect(node.children.find(child => child.tag === "section")!.id).toBe("1/0");
  });

  test("display: contents children are hoisted in order and keep DOM-based paths", () => {
    const snap = synth([
      "html", {}, { b: [0, 0, 100, 100] }, [
        ["body", {}, { b: [0, 0, 100, 100] }, [
          ["div", { id: "root" }, { b: [0, 0, 100, 100] }, [
            ["p", {}, { b: [0, 0, 100, 10] }, ["a"]],
            ["div", { class: "wrap" }, undefined, [
              ["p", {}, { b: [0, 10, 100, 10] }, ["b"]],
              ["div", { class: "wrap" }, undefined, [["p", {}, { b: [0, 20, 100, 10] }, ["c"]]]],
            ]],
            ["div", { hidden: "" }, undefined, [["p", {}, undefined, []]]],
            ["p", {}, { b: [0, 30, 100, 10] }, ["d"]],
          ]],
        ]],
      ],
    ]);
    const tree = snapshotToTree(snap);
    const root = tree.children[0]!.children[0]!;
    const node = toLayout(root, { x: 0, y: 0 }, pathIdentity)!;
    expect(node.children.map((c) => [c.id, c.children[0]!.text])).toEqual([
      ["0", "a"],
      ["1/0", "b"],
      ["1/1/0", "c"],
      ["3", "d"],
    ]);
  });

  test("pseudo-elements: ::before/::marker first, ::after last, text child, box from offsets, no index consumed", () => {
    const snap = synth([
      "html", {}, { b: [0, 0, 100, 100] }, [
        ["body", {}, { b: [0, 0, 100, 100] }, [
          ["li", { id: "root" }, { b: [10, 10, 80, 20], styles: { position: "relative", "border-left-width": "2px", "border-top-width": "3px" } }, [
            ["::after", {}, { b: [70, 12, 10, 16], pseudo: "after", text: " →", styles: { position: "static" } }, []],
            ["::before", {}, { b: [0, 0, 0, 0], o: [4, 6, 8, 8], pseudo: "before", text: "", styles: { position: "absolute" } }, []],
            ["::marker", {}, { b: [0, 12, 10, 16], o: [-10, 2, 10, 16], pseudo: "marker", text: "• ", styles: {} }, []],
            ["::first-letter", {}, { b: [12, 12, 10, 16], pseudo: "first-letter", text: "I" }, []],
            "Item",
            ["span", {}, { b: [40, 12, 20, 16] }, ["x"]],
          ]],
        ]],
      ],
    ]);
    const tree = snapshotToTree(snap);
    const root = tree.children[0]!.children[0]!;
    const node = toLayout(root, { x: 10, y: 10 }, pathIdentity)!;
    expect(node.children.map((c) => c.tag)).toEqual(["::before", "::marker", "#text", "span", "::after"]);
    const [before, marker, , span, after] = node.children;
    // absolute pseudo: li padding edge (10+2, 10+3) + offset (4, 6), rebased by (10, 10)
    expect(before!.bounds).toEqual({ x: 6, y: 9, w: 8, h: 8 });
    expect(before!.children).toEqual([]);
    expect(before!.id).toBe("::before");
    expect(marker!.bounds).toEqual({ x: -8, y: 5, w: 10, h: 16 });
    expect(marker!.children[0]).toMatchObject({ tag: "#text", text: "• ", bounds: { x: -10, y: 2, w: 10, h: 16 } });
    expect(after!.children[0]!.text).toBe(" →");
    expect(span!.id).toBe("0");
  });

  test("an empty pseudo-element without a box is dropped", () => {
    const snap = synth([
      "html", {}, { b: [0, 0, 100, 100] }, [
        ["body", {}, { b: [0, 0, 100, 100] }, [
          ["p", { id: "root" }, { b: [0, 0, 100, 20] }, [["::before", {}, { b: [0, 0, 0, 0], o: [0, 0, 0, 18], pseudo: "before", text: "" }, []], "t"]],
        ]],
      ],
    ]);
    const node = toLayout(snapshotToTree(snap).children[0]!.children[0]!, { x: 0, y: 0 }, pathIdentity)!;
    expect(node.children.map((c) => c.tag)).toEqual(["#text"]);
  });

  test("img data-h2s-src names the loaded srcset or <picture> candidate as authored", () => {
    const snap = synth([
      "html", {}, { b: [0, 0, 100, 100] }, [
        ["body", { id: "root" }, { b: [0, 0, 100, 100] }, [
          ["img", { src: "a.png", srcset: "a.png 1x, b.png 2x" }, { b: [0, 0, 10, 10] }, []],
          ["picture", {}, { b: [0, 10, 10, 10] }, [
            ["source", { srcset: "c.webp 1x, d.webp 2x" }, undefined, []],
            ["img", { src: "a.png" }, { b: [0, 10, 10, 10] }, []],
          ]],
          ["img", { src: "a.png" }, { b: [0, 20, 10, 10] }, []],
        ]],
      ],
    ]);
    const doc = snap.documents[0]!;
    const S = (s: string) => snap.strings.push(s) - 1;
    doc.nodes.currentSourceURL = { index: [2, 5, 6], value: [S("http://x/b.png"), S("http://x/d.webp"), S("http://x/a.png")] };
    const node = toLayout(snapshotToTree(snap).children[0]!, { x: 0, y: 0 }, pathIdentity)!;
    const imgs = node.children.flatMap((c) => (c.tag === "img" ? [c] : c.children));
    expect(imgs.map((i) => i.attrs["data-h2s-src"])).toEqual(["b.png", "d.webp", undefined]);
  });

  test("sparse live form columns replace stale attributes, including empty values", () => {
    const snap = synth(["html", {}, { b: [0, 0, 100, 100] }, [
      ["main", {}, { b: [0, 0, 100, 100] }, [
        ["input", { value: "old", checked: "" }, { b: [0, 0, 20, 20] }, []],
        ["textarea", {}, { b: [0, 20, 20, 20] }, ["old"]],
        ["select", {}, { b: [0, 40, 20, 20] }, [
          ["option", { selected: "" }, undefined, ["Old"]],
          ["option", {}, undefined, ["New"]],
        ]],
      ]],
    ]]);
    const nodes = snap.documents[0]!.nodes;
    nodes.inputValue = { index: [2], value: [-1] };
    nodes.textValue = { index: [3], value: [snap.strings.push("live") - 1] };
    nodes.inputChecked = { index: [] };
    nodes.optionSelected = { index: [8] };
    const layout = toLayout(snapshotToTree(snap).children[0]!, { x: 0, y: 0 }, pathIdentity)!;
    expect(layout.children[0]!.attrs).toMatchObject({ value: "" });
    expect("checked" in layout.children[0]!.attrs).toBe(false);
    expect(layout.children[1]!.attrs.value).toBe("live");
    const options = layout.children[2]!.children.filter((child) => child.tag === "option");
    expect(options.map((option) => "selected" in option.attrs)).toEqual([false, true]);
  });

  test("button input values keep missing defaults distinct from explicit empty and live changes", () => {
    const snap = synth(["html", {}, { b: [0, 0, 100, 100] }, [
      ["main", {}, { b: [0, 0, 100, 100] }, [
        ["input", { type: "submit" }, { b: [0, 0, 20, 20] }, []],
        ["input", { type: "reset" }, { b: [0, 20, 20, 20] }, []],
        ["input", { type: "button", value: "" }, { b: [0, 40, 20, 20] }, []],
        ["input", { type: "button", value: "Before" }, { b: [0, 60, 20, 20] }, []],
      ]],
    ]]);
    snap.documents[0]!.nodes.inputValue = { index: [2, 3, 4, 5], value: [-1, -1, -1, snap.strings.push("After") - 1] };
    const inputs = snapshotToTree(snap).children[0]!.children;
    expect(inputs.map(input => input.attrs.value)).toEqual([undefined, undefined, "", "After"]);
  });
});
