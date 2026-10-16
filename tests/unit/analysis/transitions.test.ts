import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { walk, type SemNode, type TransitionSpec } from "../../../src/model/semantic.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Transition } from "../../../src/model/layout.ts";

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(0, 0, 0)" };
const BLUE = "rgb(37, 99, 235)";
const DARK = "rgb(30, 64, 175)";
const TAILWIND = "cubic-bezier(0.4, 0, 0.2, 1)";
const BORDER = (c: string) =>
  Object.fromEntries(
    ["top", "right", "bottom", "left"].flatMap((e) => [
      [`border-${e}-width`, "1px"],
      [`border-${e}-style`, "solid"],
      [`border-${e}-color`, c],
    ]),
  );

const t = (property: string, duration: number, easing = TAILWIND, delay = 0): Transition => ({
  property,
  duration,
  delay,
  easing,
  from: "",
  to: "",
});

let ids = 0;
function el(
  tag: string,
  styles: Record<string, string>,
  extra: Partial<LayoutNode> = {},
  children: LayoutNode[] = [],
): LayoutNode {
  return {
    tag,
    id: `n${++ids}`,
    attrs: {},
    styles: { ...FONT, display: "block", ...styles },
    bounds: { x: 0, y: 0, w: 120, h: 40 },
    children,
    ...extra,
  };
}
const text = (value: string): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x: 10, y: 10, w: 40, h: 20 },
  text: value,
  children: [],
});

function infer(...children: LayoutNode[]): SemNode[] {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "transitions.html",
    combo: { screen: "transitions", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", {}, {}, children),
  };
  const out: SemNode[] = [];
  walk(inferScreen(doc, "Transitions").root, (n) => out.push(n));
  return out;
}
const control = (nodes: SemNode[]) => nodes.find((n) => n.kind === "control")!;
const spec = (duration: number, bezier: [number, number, number, number] = [0.4, 0, 0.2, 1]): TransitionSpec => ({
  duration,
  delay: 0,
  easing: { bezier },
});

test("Tailwind transition-all: fill and scale animate; Reduce Motion drops only the scale", () => {
  const list = [t("background-color", 150), t("transform", 150)];
  const btn = control(
    infer(
      el(
        "button",
        { "background-color": BLUE },
        {
          states: { pressed: { "background-color": DARK, transform: "matrix(0.96, 0, 0, 0.96, 0, 0)" } },
          motion: { transitions: { pressed: { in: list, out: list } } },
        },
        [text("Save")],
      ),
    ),
  );
  const p = btn.motion!.transitions!.pressed!;
  expect(p.in).toEqual({ fills: spec(150), transform: spec(150) });
  expect(p.out).toEqual(p.in);
  expect(p.reduced).toEqual({ in: { fills: spec(150) }, out: { fills: spec(150) } });
});

test("motion-reduced press: 50 ms in, 200 ms out, author reduce lists empty", () => {
  const btn = control(
    infer(
      el(
        "button",
        { "background-color": BLUE },
        {
          states: { pressed: { "background-color": DARK } },
          motion: {
            transitions: {
              pressed: {
                in: [t("background-color", 50, "ease")],
                out: [t("background-color", 200, "ease")],
                reduced: { in: [], out: [] },
              },
            },
          },
        },
        [text("Press")],
      ),
    ),
  );
  const p = btn.motion!.transitions!.pressed!;
  expect(p.in.fills).toEqual(spec(50, [0.25, 0.1, 0.25, 1]));
  expect(p.out.fills!.duration).toBe(200);
  expect(p.reduced).toEqual({ in: {}, out: {} });
});

test("a changed field the transition does not list jumps, silently", () => {
  const btn = control(
    infer(
      el(
        "button",
        { "background-color": BLUE },
        {
          states: { pressed: { "background-color": DARK, "box-shadow": "rgba(0, 0, 0, 0.2) 0px 1px 2px 0px" } },
          motion: { transitions: { pressed: { in: [t("background-color", 150)], out: [t("background-color", 150)] } } },
        },
        [text("Save")],
      ),
    ),
  );
  expect(btn.states!.pressed!.shadows).toBeDefined();
  expect(btn.motion!.transitions!.pressed!.in).toEqual({ fills: spec(150) });
  expect(btn.diagnostics.filter((d) => d.feature.startsWith("transition-"))).toEqual([]);
});

test("two properties of one field timed differently: the first in PAINT_FIELD order wins, reported", () => {
  const list = [t("border-left-color", 300), t("border-top-color", 150)];
  const field = control(
    infer(
      el("input", BORDER("rgb(209, 213, 219)"), {
        attrs: { placeholder: "Email" },
        states: { focused: BORDER(BLUE) },
        motion: { transitions: { focused: { in: list, out: list } } },
      }),
    ),
  );
  expect(field.motion!.transitions!.focused!.in).toEqual({ border: spec(150) });
  const d = field.diagnostics.find((d) => d.feature === "transition-duration")!;
  expect(d.level).toBe("approximated");
  expect(d.message).toContain("border-left-color");
  expect(d.message).toContain("border-top-color");
});

test("a negative delay clamps to 0 and is reported", () => {
  const list = [t("background-color", 150, TAILWIND, -50)];
  const btn = control(
    infer(
      el(
        "button",
        { "background-color": BLUE },
        {
          states: { pressed: { "background-color": DARK } },
          motion: { transitions: { pressed: { in: list, out: list } } },
        },
        [text("Save")],
      ),
    ),
  );
  expect(btn.motion!.transitions!.pressed!.in.fills!.delay).toBe(0);
  expect(btn.diagnostics.some((d) => d.level === "approximated" && d.feature === "transition-delay")).toBe(true);
});

test("color maps to runColors on the text node and to nothing on its button", () => {
  const list = [t("color", 150), t("background-color", 150)];
  const nodes = infer(
    el(
      "button",
      { "background-color": BLUE },
      {
        states: { pressed: { "background-color": DARK, color: "rgb(255, 255, 0)" } },
        motion: { transitions: { pressed: { in: list, out: list } } },
      },
      [text("Save")],
    ),
  );
  expect(control(nodes).motion!.transitions!.pressed!.in).toEqual({ fills: spec(150) });
  const caption = nodes.find((n) => n.kind === "text")!;
  expect(caption.motion!.transitions!.pressed!.in).toEqual({ runColors: spec(150) });
});
