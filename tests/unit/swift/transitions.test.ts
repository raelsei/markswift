import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode, type Transition } from "../../../src/model/layout.ts";

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(0, 0, 0)" };
const BLUE = "rgb(37, 99, 235)";
const DARK = "rgb(30, 64, 175)";
const TAILWIND = "cubic-bezier(0.4, 0, 0.2, 1)";
const SHADOW = "rgba(0, 0, 0, 0.2) 0px 1px 2px 0px";
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
const CURVE = ".timingCurve(0.4, 0.0, 0.2, 1.0, duration: 0.15)";
const anim = (cond: string, into: string, back = into, reducedInto = into, reducedBack = back) =>
  `.modifier(MarkswiftStateAnimation(isOn: ${cond}, into: ${into}, back: ${back}, reducedInto: ${reducedInto}, reducedBack: ${reducedBack}))`;

function node(tag: string, styles: Record<string, string>, extra: Partial<LayoutNode>, children: LayoutNode[] = []) {
  return {
    tag,
    id: tag,
    attrs: {},
    styles: { ...FONT, display: "block", ...styles },
    bounds: { x: 0, y: 0, w: 120, h: 40 },
    children,
    ...extra,
  } satisfies LayoutNode;
}
const caption: LayoutNode = {
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x: 10, y: 10, w: 40, h: 20 },
  text: "Save",
  children: [],
};
const button = (pressed: Record<string, string>, transitions?: { in: Transition[]; out: Transition[] }) =>
  node(
    "button",
    { "background-color": BLUE },
    { states: { pressed }, ...(transitions ? { motion: { transitions: { pressed: transitions } } } : {}) },
    [caption],
  );

function lines(child: LayoutNode, mode: "app" | "fidelity" = "app"): string[] {
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
    root: node("main", {}, { bounds: { x: 0, y: 0, w: 320, h: 400 } }, [child]),
  };
  return compileLayout(doc, { mode })
    .code.split("\n")
    .map((l) => l.trim());
}
const after = (code: string[], prefix: string) => code[code.findIndex((l) => l.startsWith(prefix)) + 1];

test("uniform: one modifier ends the box; the scale gets its own without a reduced pair", () => {
  const list = [t("background-color", 150), t("transform", 150)];
  const code = lines(
    button({ "background-color": DARK, transform: "matrix(0.96, 0, 0, 0.96, 0, 0)" }, { in: list, out: list }),
  );
  const box = code.indexOf(anim("isSavePressed", CURVE));
  expect(box).toBeGreaterThan(code.findIndex((l) => l.startsWith(".background((isSavePressed")));
  expect(code[box + 1]).toBe(".contentShape(Rectangle())");
  expect(after(code, ".scaleEffect(x: isSavePressed")).toBe(anim("isSavePressed", CURVE, CURVE, "nil", "nil"));
});

test("per direction: the new state's timing", () => {
  const code = lines(
    button(
      { "background-color": DARK },
      { in: [t("background-color", 50, "ease")], out: [t("background-color", 200, "ease")] },
    ),
  );
  const into = ".timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.05)";
  const back = ".timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.2)";
  expect(code).toContain(anim("isSavePressed", into, back));
});

test("delay and steps()", () => {
  const delayed = [t("background-color", 150, TAILWIND, 100)];
  expect(lines(button({ "background-color": DARK }, { in: delayed, out: delayed }))).toContain(
    anim("isSavePressed", `${CURVE}.delay(0.1)`),
  );
  const stepped = [t("background-color", 300, "steps(4)")];
  expect(lines(button({ "background-color": DARK }, { in: stepped, out: stepped }))).toContain(
    anim("isSavePressed", "Animation(MarkswiftEasing(duration: 0.3, ease: .steps(4, .end)))"),
  );
});

test("mixed: the fill animates after its paint, the unlisted shadow jumps after its own", () => {
  const list = [t("background-color", 150)];
  const code = lines(button({ "background-color": DARK, "box-shadow": SHADOW }, { in: list, out: list }));
  const fill = code.indexOf(anim("isSavePressed", CURVE));
  const jump = code.indexOf(anim("isSavePressed", "nil"));
  expect(code[fill - 1]).toStartWith(".background((isSavePressed");
  expect(code[jump - 2]).toStartWith(".shadow(");
  expect(code[jump + 1]).toBe(".contentShape(Rectangle())");
  expect(code.filter((l) => l.includes("MarkswiftStateAnimation"))).toHaveLength(2);
});

test("a focused text field animates its border on its focus member", () => {
  const list = [t("border-top-color", 150)];
  const code = lines(
    node("input", BORDER("rgb(209, 213, 219)"), {
      attrs: { placeholder: "Email" },
      states: { focused: BORDER(BLUE) },
      motion: { transitions: { focused: { in: list, out: list } } },
    }),
  );
  expect(code).toContain(anim("isEmailFocused", CURVE));
});

test("fidelity output is unchanged by transitions", () => {
  const list = [t("background-color", 150), t("transform", 150)];
  const pressed = { "background-color": DARK, transform: "matrix(0.96, 0, 0, 0.96, 0, 0)" };
  expect(lines(button(pressed, { in: list, out: list }), "fidelity")).toEqual(lines(button(pressed), "fidelity"));
});
