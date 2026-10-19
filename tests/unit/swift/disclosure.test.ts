import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout, type CompileResult } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type Layer, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(17, 24, 39)" };
const GREY = "rgb(240, 240, 240)";

function el(
  tag: string,
  id: string,
  [x, y, w, h]: [number, number, number, number],
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
  states?: LayoutNode["states"],
): LayoutNode {
  return {
    id,
    tag,
    attrs,
    styles: { ...FONT, display: "block" },
    bounds: { x, y, w, h },
    children,
    ...(states ? { states } : {}),
  };
}

const text = (value: string, [x, y, w, h]: [number, number, number, number]): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x, y, w, h },
  text: value,
  children: [],
});

function doc(children: LayoutNode[], layers: Layer[], h = 200): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "disclosure.html",
    combo: { screen: "disclosure", theme: "light" },
    size: { w: 320, h },
    viewport: { x: 0, y: 0, w: 320, h },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", "root", [0, 0, 320, h], children),
    layers,
  };
}

const inflow = (id: string, trigger: string, parent: string, index: number, nodes: LayoutNode[]): Layer => ({
  id,
  trigger,
  activation: "click",
  relation: id === "more" ? "details" : "aria-controls",
  modal: false,
  placement: "inflow",
  parent,
  index,
  nodes,
  dismiss: { escape: false, outside: false, buttons: [] },
});

const para = (id: string, y: number, words: string) => el("p", id, [0, y, 320, 20], [text(words, [0, y, 100, 20])]);

const DETAILS = doc(
  [el("details", "#faq", [0, 0, 320, 20], [el("summary", "0/0", [0, 0, 320, 20], [text("More", [0, 0, 40, 20])])])],
  [inflow("more", "0/0", "#faq", 1, [para("0/1", 28, "Answer")])],
);

/** An item stack at `y`: an h3 holding the trigger button, then the next block; the layer inserts after the h3. */
const item = (n: number, y: number, states?: LayoutNode["states"]) =>
  el(
    "div",
    `item${n}`,
    [0, y, 320, 40],
    [
      el(
        "h3",
        `h${n}`,
        [0, y, 320, 20],
        [
          el(
            "button",
            `btn${n}`,
            [0, y, 320, 20],
            [text("Answer", [0, y, 60, 20])],
            { "aria-expanded": "false", "aria-controls": `c${n}` },
            states,
          ),
        ],
      ),
      para(`next${n}`, y + 20, `Next ${n}`),
    ],
  );

const STACK = (states?: LayoutNode["states"]) =>
  doc([item(0, 0, states)], [inflow("answer", "btn0", "item0", 1, [para("c0", 20, "Shown")])]);

const compile = (d: LayoutDoc, mode: "app" | "fidelity" = "app") => compileLayout(d, { name: "Disclosure", mode });

test("compiler: fidelity ignores layers byte for byte; app emits them", () => {
  const without = structuredClone(STACK());
  delete without.layers;
  expect(compile(STACK(), "fidelity").code).toBe(compile(without, "fidelity").code);
  expect(compile(STACK()).code).not.toBe(compile(without).code);
  const details = structuredClone(DETAILS);
  delete details.layers;
  expect(compile(DETAILS, "fidelity").code).toBe(compile(details, "fidelity").code);
});

test("details: an init-seeded state the DisclosureGroup binds, with the content and an open preview", () => {
  const { code, openStates } = compile(DETAILS);
  expect(code).toContain("@State private var isMoreExpanded: Bool");
  expect(code).toContain("init(isMoreExpanded: Bool = false) {");
  expect(code).toContain("_isMoreExpanded = State(initialValue: isMoreExpanded)");
  const group = code.slice(code.indexOf("DisclosureGroup(isExpanded: $isMoreExpanded) {"));
  expect(group.slice(0, group.indexOf("} label: {"))).toContain('"Answer"');
  expect(code).toContain('#Preview("Disclosure — more open") {\n    Disclosure(isMoreExpanded: true)');
  expect(openStates).toEqual({ more: "isMoreExpanded" });
  expect(compile(DETAILS, "fidelity").openStates).toBeUndefined();
});

test("stack trigger: the tap toggles, the content sits in an if, aria-expanded follows", () => {
  const { code } = compile(STACK());
  expect(code).toMatch(/Button \{\n +isAnswerExpanded\.toggle\(\)\n +onAnswer\(\)\n +\} label: \{/);
  expect(code).toMatch(/\n( +)if isAnswerExpanded \{\n\1 {4}Text\(verbatim: "Shown"\)/);
  expect(code).toContain('.accessibilityValue(isAnswerExpanded ? "expanded" : "collapsed")');
  expect(code).not.toContain('.accessibilityValue("collapsed")');
});

const fill = (c: string) => ({ "background-color": c });
const diagnostics = (r: CompileResult) => r.diagnostics.flatMap((d) => d.diagnostics.map((x) => x.message));

test("open paint: a ternary on the open state; an equal press shares it, a different one is reported", () => {
  const open = compile(STACK({ open: fill(GREY) }));
  expect(open.code).toContain("(isAnswerExpanded ? Color.markswift(0.941, 0.941, 0.941) : ");
  const same = compile(STACK({ open: fill(GREY), pressed: fill(GREY) }));
  expect(same.code).toContain("((isAnswerPressed || isAnswerExpanded) ? ");
  const other = compile(STACK({ open: fill(GREY), pressed: fill("rgb(200, 200, 200)") }));
  expect(other.code).toContain("(isAnswerExpanded ? ");
  expect(diagnostics(other)).toContain("pressed look of an open-state trigger is not reproduced");
});

function repeatedDisclosures() {
  const items = [0, 1, 2].map((n) => item(n, n * 40));
  const layers = [0, 1, 2].map((n) =>
    inflow(`answer-${n}`, `btn${n}`, `item${n}`, 1, [para(`c${n}`, n * 40 + 20, "Shown")]),
  );
  return doc(items, layers);
}

test("extraction: repeated in-flow layers keep independent screen bindings", () => {
  const { code } = compile(repeatedDisclosures());
  expect(code).toContain("ForEach");
  expect(code).toContain("@Binding var");
  for (const n of [0, 1, 2]) expect(code).toContain(`$isAnswer${n}Expanded`);
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest(
  "generated disclosures typecheck",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-disclosure-"));
    try {
      for (const [i, d] of [
        DETAILS,
        STACK({ open: fill(GREY), pressed: fill(GREY) }),
        repeatedDisclosures(),
      ].entries()) {
        const out = join(directory, String(i));
        for (const [file, content] of Object.entries(compile(d).files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);
