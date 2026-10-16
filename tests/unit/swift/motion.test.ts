import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type Anim, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const BOX = { "font-family": "system-ui", "font-size": "15px", color: "rgb(0, 0, 0)", display: "block" };
const kf = (offset: number, values: Record<string, string>, easing = "linear") => ({ offset, easing, values });
const SPIN: Anim = {
  name: "spin",
  duration: 1000,
  delay: 0,
  iterations: "infinite",
  direction: "normal",
  fill: "none",
  keyframes: [kf(0, { transform: "rotate(0deg)" }), kf(1, { transform: "rotate(360deg)" })],
};
const BLINK: Anim = {
  ...SPIN,
  name: "blink",
  keyframes: [kf(0, { opacity: "0.2" }, "ease"), kf(0.5, { opacity: "1" }, "ease"), kf(1, { opacity: "0.2" })],
};

function box(id: string, styles: Record<string, string>, motion?: LayoutNode["motion"]): LayoutNode {
  return {
    tag: "div",
    id,
    attrs: { id },
    styles: { ...BOX, "background-color": "rgb(37, 99, 235)", "transform-origin": "16px 16px", ...styles },
    bounds: { x: 0, y: 0, w: 32, h: 32 },
    preferredSize: { width: "32px", height: "32px" },
    children: [],
    ...(motion ? { motion } : {}),
  };
}

function compile(mode: "app" | "fidelity", children: LayoutNode[]) {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "motion.html",
    combo: { screen: "motion", theme: "light" },
    size: { w: 320, h: 200 },
    viewport: { x: 0, y: 0, w: 320, h: 200 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { ...BOX, display: "flex", "flex-direction": "column", "align-items": "flex-start" },
      bounds: { x: 0, y: 0, w: 320, h: 200 },
      children,
    },
  };
  const result = compileLayout(doc, { name: "Motion", mode });
  return { code: result.files["Motion.swift"]!, diagnostics: result.diagnostics };
}

const SPINNER =
  ".modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 1.0, iterations: .infinity), degrees: MarkswiftMotionTrack(0.0, [MarkswiftSegment(360.0, 1.0, .points([0.0, 1.0], [0.0, 1.0]))]))], reduced: []))";

test("app: a spinner plays through MarkswiftAnimation after the static transforms", () => {
  // Individual `rotate` keyframes over a static `transform: scale(2)`: the scale stays a static modifier.
  const turn: Anim = { ...SPIN, keyframes: [kf(0, { rotate: "none" }), kf(1, { rotate: "360deg" })] };
  const { code } = compile("app", [
    box("s", { transform: "matrix(2, 0, 0, 2, 0, 0)", "align-self": "center" }, { animations: [turn] }),
  ]);
  expect(code).toContain(SPINNER);
  const scale = code.indexOf(".scaleEffect(x: 2.0, y: 2.0");
  const anim = code.indexOf(SPINNER);
  expect(scale).toBeGreaterThan(-1);
  expect(scale).toBeLessThan(anim);
  const align = code.indexOf(".frame(maxWidth: .infinity, alignment:");
  expect(align).toBeGreaterThan(anim);
  // The static rotation (0°) is driven: no `.rotationEffect` outside the modifier.
  expect(code).not.toContain(".rotationEffect");
});

test("app: a driven opacity drops the static .opacity and becomes the base", () => {
  const { code } = compile("app", [box("b", { opacity: "0.5" }, { animations: [BLINK] })]);
  expect(code).not.toContain(".opacity(0.5)");
  expect(code).toContain("base: MarkswiftMotionValue(opacity: 0.5)");
  expect(code).toContain(
    "opacity: MarkswiftMotionTrack(0.2, [MarkswiftSegment(1.0, 0.5, .bezier(0.25, 0.1, 0.25, 1.0)), MarkswiftSegment(0.2, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))])",
  );
  // Opacity only: Reduce Motion keeps a finite… here infinite blink stops (decorative loop).
  expect(code).toContain("reduced: []");
});

test("timing arguments: delay, iterations, direction, fill; defaults omitted; off-centre anchor", () => {
  const slide: Anim = {
    name: "slide",
    duration: 400,
    delay: -300,
    iterations: 2.5,
    direction: "alternate-reverse",
    fill: "both",
    keyframes: [kf(0, { transform: "none" }, "steps(4, jump-both)"), kf(1, { transform: "translateX(40px)" })],
  };
  const { code } = compile("app", [box("t", { "transform-origin": "0px 0px" }, { animations: [slide] })]);
  expect(code).toContain(
    "MarkswiftTiming(duration: 0.4, delay: -0.3, iterations: 2.5, direction: .alternateReverse, fillBackwards: true, fillForwards: true)",
  );
  expect(code).toContain("x: MarkswiftMotionTrack(0.0, [MarkswiftSegment(40.0, 1.0, .steps(4, .both))])");
  expect(code).toContain("anchor: UnitPoint(x: 0.0, y: 0.0)");
  // Finite translate: Reduce Motion removes the movement, nothing is left.
  expect(code).toContain("reduced: []");
});

test("fidelity renders the settled look and says so", () => {
  const nodes = [box("s", {}, { animations: [SPIN] }), box("b", { opacity: "0.5" }, { animations: [BLINK] })];
  const { code, diagnostics } = compile("fidelity", nodes);
  const plain = compile(
    "fidelity",
    nodes.map(({ motion: _, ...n }) => n),
  );
  expect(code).toBe(plain.code);
  expect(code).not.toContain("MarkswiftAnimation");
  expect(
    diagnostics.some((r) =>
      r.diagnostics.some((d) => d.message === "fidelity renders the settled look; app output animates"),
    ),
  ).toBe(true);
});
