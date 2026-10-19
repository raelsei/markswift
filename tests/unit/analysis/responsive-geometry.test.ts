import { expect, test } from "bun:test";
import { styleOf, stateStylesOf } from "../../../src/analysis/style.ts";
import { relativeOffset } from "../../../src/analysis/geometry.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

const node = (styles: Record<string, string>, preferredSize?: LayoutNode["preferredSize"]): LayoutNode => ({
  tag: "div",
  attrs: {},
  styles,
  bounds: { x: 0, y: 0, w: 200, h: 100 },
  children: [],
  preferredSize,
});

test("percentage translation retains independent width and height slopes through individual rotation", () => {
  const n = node(
    { transform: "matrix(1,0,0,1,-76,25)", rotate: "90deg" },
    {
      width: "100%",
      height: "100px",
      transformTranslation: { x: [-0.38, 0], y: [0, 0.25] },
    },
  );
  expect(styleOf(n, []).transform?.responsive).toEqual({ x: [0, -0.25], y: [-0.38, 0] });
});

test("a percentage transform that cancels at the capture size still responds at other sizes", () => {
  const n = node(
    { transform: "matrix(1,0,0,1,0,0)" },
    {
      width: "100%",
      height: "100px",
      transformTranslation: { x: [-0.5, 0], y: [0, 0] },
    },
  );
  expect(styleOf(n, []).transform?.responsive).toEqual({ x: [-0.5, 0], y: [0, 0] });
});

test("individual percentage translate follows the border box; px transforms stay static", () => {
  expect(styleOf(node({ translate: "-38% 25%" }), []).transform?.responsive).toEqual({ x: [-0.38, 0], y: [0, 0.25] });
  expect(styleOf(node({ transform: "matrix(1,0,0,1,10,20)" }), []).transform?.responsive).toBeUndefined();
});

test("measured relative offsets override containing-block guesses, including resolved auto zero", () => {
  const n = node(
    { position: "relative" },
    {
      width: "100%",
      height: "20px",
      insets: { top: "10%", bottom: "auto", left: "auto", right: "auto" },
      relativeOffset: [0, 20],
    },
  );
  expect(relativeOffset(n, undefined).offset).toEqual([0, 20]);
  n.preferredSize!.relativeOffset = [0, 0];
  expect(relativeOffset(n, undefined)).toEqual({ offset: [0, 0], losses: [] });
});

test("a state's replacement transform does not inherit resting percentage slopes", () => {
  const n = node(
    { transform: "matrix(1,0,0,1,-76,0)" },
    {
      width: "100%",
      height: "100px",
      transformTranslation: { x: [-0.38, 0], y: [0, 0] },
    },
  );
  n.states = { pressed: { transform: "matrix(1,0,0,1,10,0)" } };
  const rest = styleOf(n, []);
  expect(rest.transform?.responsive).toBeDefined();
  expect(stateStylesOf(n, rest)?.pressed?.transform?.responsive).toBeUndefined();
  expect(stateStylesOf(n, rest)?.pressed?.transform?.tx).toBe(10);
});
