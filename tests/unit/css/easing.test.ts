import { expect, test } from "bun:test";
import { parseEasing } from "../../../src/css/easing.ts";

test("keywords", () => {
  expect(parseEasing("ease")).toEqual({ bezier: [0.25, 0.1, 0.25, 1] });
  expect(parseEasing("linear")).toEqual({
    points: [
      [0, 1],
      [0, 1],
    ],
  });
  expect(parseEasing("ease-in-out")).toEqual({ bezier: [0.42, 0, 0.58, 1] });
  expect(parseEasing("step-start")).toEqual({ steps: [1, "start"] });
});

test("cubic-bezier()", () => {
  expect(parseEasing("cubic-bezier(0.4, 0, 0.2, 1)")).toEqual({ bezier: [0.4, 0, 0.2, 1] });
  expect(parseEasing("cubic-bezier(0.34, 1.56, 0.64, 1)")).toEqual({ bezier: [0.34, 1.56, 0.64, 1] });
  expect(parseEasing("cubic-bezier(1.2, 0, 0.2, 1)")).toBeUndefined();
});

test("steps()", () => {
  expect(parseEasing("steps(8)")).toEqual({ steps: [8, "end"] });
  expect(parseEasing("steps(4, jump-start)")).toEqual({ steps: [4, "start"] });
  expect(parseEasing("steps(3, jump-none)")).toEqual({ steps: [3, "none"] });
  expect(parseEasing("steps(4, jump-both)")).toEqual({ steps: [4, "both"] });
  expect(parseEasing("steps(1, jump-none)")).toBeUndefined();
});

test("linear() completes missing inputs", () => {
  expect(parseEasing("linear(0, 0.25 75%, 1)")).toEqual({
    points: [
      [0, 0.25, 1],
      [0, 0.75, 1],
    ],
  });
  expect(parseEasing("linear(0 0%, 0.25 75%, 1 100%)")).toEqual({
    points: [
      [0, 0.25, 1],
      [0, 0.75, 1],
    ],
  });
  expect(parseEasing("linear(0, 0.5, 1)")).toEqual({
    points: [
      [0, 0.5, 1],
      [0, 0.5, 1],
    ],
  });
  // Two percentages make two points; an input below an earlier one is clamped up to it.
  expect(parseEasing("linear(0, 0.5 25% 75%, 1)")).toEqual({
    points: [
      [0, 0.5, 0.5, 1],
      [0, 0.25, 0.75, 1],
    ],
  });
  expect(parseEasing("linear(0, 1 50%, 0.5 20%, 1)")).toEqual({
    points: [
      [0, 1, 0.5, 1],
      [0, 0.5, 0.5, 1],
    ],
  });
});

test("garbage", () => {
  expect(parseEasing("bounce")).toBeUndefined();
  expect(parseEasing("steps(x)")).toBeUndefined();
  expect(parseEasing("linear(0)")).toBeUndefined();
  expect(parseEasing("cubic-bezier(0, 0, 1)")).toBeUndefined();
});
