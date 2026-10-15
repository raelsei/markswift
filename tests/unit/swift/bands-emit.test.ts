/** Plan 054: a merged breakpoint screen emits band chains, band-parameterised containers and one state per control. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout, type CompileOptions } from "../../../src/compiler/index.ts";
import type { LayoutCondition, LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { typecheckLoose } from "../../../tools/verify/typecheck-loose.ts";
import { band, el, txt } from "../../helpers/bands.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const THREE: LayoutCondition[] = [
  { kind: "media", query: "(min-width: 600px)", matches: false },
  { kind: "media", query: "(min-width: 1000px)", matches: false },
];

const compile = (docs: LayoutDoc[], options: CompileOptions = {}) =>
  compileLayout(docs[0]!, { ...options, variants: docs.slice(1) });
/** `#x`: a paragraph whose colour a `(min-width: 600px)` rule changes in the bands `red` lists. */
const coloured = (w: number, red: boolean) =>
  el("x", "p", { x: 0, y: 0, w, h: 20 }, { color: red ? "rgb(255, 0, 0)" : "rgb(0, 0, 0)" }, [txt("X", w)], {
    conditional: [0],
  });
const plain = (w: number) =>
  el("plain", "section", { x: 0, y: 20, w, h: 40 }, {}, [
    el("p1", "p", { x: 0, y: 20, w, h: 20 }, {}, [txt("One", w)]),
    el("p2", "p", { x: 0, y: 40, w, h: 20 }, {}, [txt("Two", w)]),
  ]);
const wrap = (w: number, children: LayoutNode[]) => el("box", "div", { x: 0, y: 0, w, h: 20 }, {}, children);

test("a holder emits a band chain: two bands, and three with a non-contiguous member", () => {
  const two = compile([390, 834].map((w) => band(w, [wrap(w, [coloured(w, w > 600)]), plain(w)]))).code;
  expect(two).toMatch(
    /\n( +)Group \{\n\1 {4}if band >= 1 \{\n\1 {8}Text\(verbatim: "X"\)[^\n]*\n(?:\1 {8}\.[^\n]*\n)*\1 {4}\} else \{\n\1 {8}Text\(verbatim: "X"\)[^\n]*\n(?:\1 {8}\.[^\n]*\n)*\1 {4}\}\n\1\}\n/,
  );
  const three = compile(
    [390, 700, 1100].map((w) => band(w, [wrap(w, [coloured(w, w === 700)]), plain(w)], THREE)),
  ).code;
  expect(three).toContain("MarkswiftBands(edges: [.atLeast(600.0), .atLeast(1000.0)]) { band in");
  // [0, 2] holds band 0, so it is the plain `else`; [1] is not every band from 1 up.
  expect(three).toMatch(/\n( +)Group \{\n\1 {4}if \[1\]\.contains\(band\) \{\n[\s\S]*?\n\1 {4}\} else \{\n/);
  const higher = compile(
    [390, 700, 1100].map((w) => band(w, [wrap(w, [coloured(w, w > 1000)]), plain(w)], THREE)),
  ).code;
  expect(higher).toContain("if band >= 2 {");
});

test("only containers whose subtree holds a holder take the band", () => {
  const code = compile([390, 834].map((w) => band(w, [wrap(w, [coloured(w, w > 600)]), plain(w)]))).code;
  expect(code).toContain("private func v_box(_ band: Int) -> some View {");
  expect(code).toContain("v_box(band)");
  expect(code).toContain("private var v_plain: some View {");
  expect(code).toMatch(
    /var body: some View \{\n {8}MarkswiftBands\(edges: \[\.atLeast\(600\.0\)\]\) \{ band in\n {12}v_root\(band\)\n/,
  );
});

test("a scrolling root hosts MarkswiftBands inside its ScrollView", () => {
  const docs = [390, 834].map((w) => {
    const d = band(w, [wrap(w, [coloured(w, w > 600)]), plain(w)]);
    return { ...d, size: { w, h: 1200 }, root: { ...d.root, bounds: { ...d.root.bounds, h: 1200 } } };
  });
  const code = compile(docs).code;
  const body = code.slice(code.indexOf("var body: some View {"), code.indexOf("\n    }\n", code.indexOf("var body")));
  expect(body).not.toContain("MarkswiftBands");
  expect(body).toContain("v_root");
  expect(code).toMatch(/ScrollView\(\.vertical\) \{\n +MarkswiftBands\(edges: \[\.atLeast\(600\.0\)\]\) \{ band in\n/);
  expect(code).toContain("private var v_root: some View {");
});

test("one @State and one pressed member per control across alternatives", () => {
  const form = (w: number) =>
    el(
      "form",
      "div",
      { x: 0, y: 0, w, h: 40 },
      { display: "flex", "flex-direction": w > 600 ? "row" : "column" },
      [
        el("q", "input", { x: 0, y: 0, w: 200, h: 20 }, {}, [], { attrs: { type: "text", value: "hi" } }),
        el("go", "button", { x: 0, y: 20, w: 60, h: 20 }, { "background-color": "rgb(0, 0, 255)" }, [txt("Go", 60)], {
          states: { pressed: { "background-color": "rgb(0, 0, 128)" } },
        }),
      ],
      { conditional: [0] },
    );
  const code = compile([390, 834].map((w) => band(w, [form(w)]))).code;
  expect(code.match(/@State private var s_/g)).toHaveLength(1);
  const state = /@State private var (s_\w+)/.exec(code)![1]!;
  expect(code.match(new RegExp(`\\$${state}\\b`, "g"))).toHaveLength(2);
  expect(code.match(/@MarkswiftPressed private var/g)).toHaveLength(1);
});

/** Four equal cards; with `holder`, each title is recoloured from 600px up, else a separate paragraph is. */
const cards = (w: number, holder: boolean) =>
  band(w, [
    el(
      "list",
      "div",
      { x: 0, y: 0, w, h: 160 },
      {},
      [1, 2, 3, 4].map((i) =>
        el(`card${i}`, "div", { x: 0, y: (i - 1) * 40, w, h: 40 }, { "background-color": "rgb(240, 240, 240)" }, [
          el(
            `card${i}/t`,
            "p",
            { x: 0, y: (i - 1) * 40, w, h: 20 },
            { color: holder && w > 600 ? "rgb(200, 0, 0)" : "rgb(0, 0, 0)" },
            [txt(`Item ${i}`, w)],
            holder ? { conditional: [0] } : {},
          ),
          el(`card${i}/u`, "p", { x: 0, y: (i - 1) * 40 + 20, w, h: 20 }, {}, [txt(`Sub ${i}`, w)]),
        ]),
      ),
    ),
    ...(holder ? [] : [coloured(w, w > 600)]),
  ]);

test("repeated cards holding a holder stay one ForEach whose row reads the band from the environment", () => {
  const code = compile([390, 834].map((w) => cards(w, true))).code;
  expect(code.match(/ForEach\(/g)).toHaveLength(1);
  expect(code).toMatch(/struct ItemView: View \{\n {8}@Environment\(\\\.markswiftBand\) private var band\n/);
  const without = compile([390, 834].map((w) => cards(w, false))).code;
  expect(without).toContain("MarkswiftBands(");
  expect(without.match(/ForEach\(/g)?.length).toBe(compileLayout(cards(390, false)).code.match(/ForEach\(/g)?.length);
  expect(without).not.toContain("markswiftBand");
});

test("fidelity mode compiles a breakpoint view", () => {
  const code = compile(
    [390, 834].map((w) => band(w, [wrap(w, [coloured(w, w > 600)]), plain(w)])),
    { mode: "fidelity" },
  ).code;
  expect(code).toContain("MarkswiftBands(edges: [.atLeast(600.0)]) { band in");
});

nativeTest(
  "a three-band breakpoint view typechecks with and without MainActor default isolation",
  async () => {
    const r = compile(
      [390, 700, 1100].map((w) =>
        band(w, [wrap(w, [coloured(w, w === 700)]), plain(w), cards(w, true).root.children[0]!], THREE),
      ),
    );
    expect(r.code).toContain("MarkswiftBands(");
    const directory = await mkdtemp(join(tmpdir(), "markswift-bands-emit-"));
    try {
      for (const [file, source] of Object.entries(r.files))
        if (file.endsWith(".swift")) await Bun.write(join(directory, file), source);
      for (const check of [await typecheck(directory), await typecheckLoose(directory)])
        if (!check.ok) throw new Error(check.output);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  180000,
);
