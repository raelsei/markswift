import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { applyLayers } from "../../../src/analysis/layers.ts";
import { LAYOUT_DOC_VERSION, type Layer, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import type { ControlNode, SemNode, StackNode } from "../../../src/model/semantic.ts";

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(17, 24, 39)" };

function el(
  tag: string,
  id: string,
  [x, y, w, h]: [number, number, number, number],
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
): LayoutNode {
  return { id, tag, attrs, styles: { ...FONT, display: "block" }, bounds: { x, y, w, h }, children };
}

function text(value: string, [x, y, w, h]: [number, number, number, number]): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x, y, w, h }, text: value, children: [] };
}

function doc(children: LayoutNode[], layers?: Layer[], theme: "light" | "dark" = "light"): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "layers.html",
    combo: { screen: "layers", theme },
    size: { w: 320, h: 200 },
    viewport: { x: 0, y: 0, w: 320, h: 200 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", "root", [0, 0, 320, 200], children),
    ...(layers ? { layers } : {}),
  };
}

function layer(extra: Partial<Layer> & Pick<Layer, "trigger" | "parent" | "index" | "nodes">): Layer {
  return {
    id: "answer",
    activation: "click",
    relation: "aria-controls",
    modal: false,
    placement: "inflow",
    dismiss: { escape: false, outside: false, buttons: [] },
    ...extra,
  };
}

const find = (n: SemNode, id: string): SemNode | undefined => {
  if (n.id === id) return n;
  const kids = n.kind === "stack" || n.kind === "grid" ? n.children : n.kind === "control" ? n.content : [];
  for (const c of kids) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
};

const ANSWER = (y: number) => el("p", "c", [0, y, 320, 30], [text("Answer", [0, y, 60, 20])]);

const details = () =>
  doc(
    [el("details", "#faq", [0, 0, 320, 20], [el("summary", "0/0", [0, 0, 320, 20], [text("More", [0, 0, 40, 20])])])],
    [layer({ id: "more", relation: "details", trigger: "0/0", parent: "#faq", index: 1, nodes: [ANSWER(28)] })],
  );

test("details: the closed content joins the disclosure and the control opens the layer", () => {
  const d = details();
  const without = find(inferScreen(d, "s").root, "#faq") as ControlNode;
  expect(without.content).toEqual([]);
  const screen = inferScreen(d, "s");
  applyLayers(screen, d);
  const control = find(screen.root, "#faq") as ControlNode;
  expect(control.content.map((c) => c.id)).toEqual(["c"]);
  expect(control.opens).toEqual({ layer: "more", kind: "inflow" });
});

test("details: content Chrome already laid out in the closed rest capture is not added twice", () => {
  const d = details();
  d.root.children[0]!.children.push(ANSWER(28));
  const screen = inferScreen(d, "s");
  applyLayers(screen, d);
  const control = find(screen.root, "#faq") as ControlNode;
  expect(control.content.map((c) => c.id)).toEqual(["c"]);
  expect(control.opens).toEqual({ layer: "more", kind: "inflow" });
});

/** An item stack: an h3 holding the trigger button, then the next item; `next` sits `gap` px below the h3. */
const item = (index: number, contentY: number, gap = 0, triggerTag = "button") =>
  doc(
    [
      el(
        "div",
        "item",
        [0, 0, 320, 40 + gap],
        [
          el("h3", "h3", [0, 0, 320, 20], [el(triggerTag, "btn", [0, 0, 320, 20], [text("Question", [0, 0, 60, 20])])]),
          el("div", "next", [0, 20 + gap, 320, 20], [text("Next", [0, 20 + gap, 40, 20])]),
        ],
      ),
    ],
    [layer({ trigger: "btn", parent: "item", index, nodes: [ANSWER(contentY)] })],
  );

const run = (d: LayoutDoc, edit?: (stack: StackNode) => void) => {
  const screen = inferScreen(d, "s");
  const stack = find(screen.root, "item") as StackNode;
  edit?.(stack);
  applyLayers(screen, d);
  return { screen, stack };
};

test("stack: the content goes after its predecessor behind the trigger's layer, uniform spacing kept", () => {
  const { screen, stack } = run(item(1, 20));
  expect(stack.children.map((c) => c.id)).toEqual(["h3", "c", "next"]);
  expect(stack.spacing).toBe(0);
  expect(stack.children[1]!.shownBy).toBe("answer");
  expect(find(screen.root, "btn")!.opens).toEqual({ layer: "answer", kind: "inflow" });
});

test("stack: per-pair spacing gains the predecessor → content gap; the old gap follows the content", () => {
  const { stack } = run(item(1, 20), (s) => (s.spacing = [8]));
  expect(stack.spacing).toEqual([0, 8]);
  const { stack: wide } = run(item(1, 40), (s) => (s.spacing = [8]));
  expect(wide.spacing).toEqual([20, 8]);
});

test("stack: a measured gap unlike the uniform spacing becomes per-pair spacing", () => {
  const { stack } = run(item(1, 40, 8));
  expect(stack.spacing).toEqual([20, 8]);
});

const messages = (n: SemNode | undefined) => n?.diagnostics.map((d) => `${d.feature}: ${d.message}`) ?? [];

test("skips: measured parent, trigger without action, index 0 with per-pair spacing", () => {
  const measured = run(item(1, 20), (s) => (s.measured = { width: 320, height: 40, frames: [] }));
  expect(measured.stack.children.map((c) => c.id)).toEqual(["h3", "next"]);
  expect(messages(measured.stack)).toContain(
    "@aria-*: content shown by answer is not emitted: its container is a measured, wrapping, flex or grid layout",
  );
  expect(find(measured.screen.root, "btn")!.opens).toBeUndefined();

  const plain = run(item(1, 20, 0, "span"));
  expect(plain.stack.children.map((c) => c.id)).toEqual(["h3", "next"]);
  expect(messages(plain.stack)).toContain(
    "@aria-*: content shown by answer is not emitted: the trigger is not a button",
  );

  const first = run(item(0, 0), (s) => (s.spacing = [5]));
  expect(first.stack.children.map((c) => c.id)).toEqual(["h3", "next"]);
  expect(messages(first.stack)).toContain(
    "@aria-*: content shown by answer is not emitted: no stable sibling to insert after",
  );
});

test("a dark doc without the layer leaves the dark screen unchanged", () => {
  const light = item(1, 20);
  const dark = { ...light, combo: { ...light.combo, theme: "dark" as const } };
  delete dark.layers;
  const screen = inferScreen(dark, "s");
  const before = JSON.stringify(screen);
  applyLayers(screen, dark);
  expect(JSON.stringify(screen)).toBe(before);
});
