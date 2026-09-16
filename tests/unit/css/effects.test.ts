import { describe, expect, test } from "bun:test";
import { parseClipPath, parseFilters } from "../../../src/css/effects.ts";
import type { ClipShape, Filter } from "../../../src/model/semantic.ts";


describe("parseFilters", () => {
  test.each<[string, Filter[]]>([
    ["blur(3px)", [{ kind: "blur", radius: 3 }]],
    ["grayscale(1)", [{ kind: "grayscale", amount: 1 }]],
    ["grayscale(0.5) blur(1px)", [{ kind: "grayscale", amount: 0.5 }, { kind: "blur", radius: 1 }]],
    ["brightness(1.4)", [{ kind: "brightness", amount: 1.4 }]],
    ["contrast(1.8)", [{ kind: "contrast", amount: 1.8 }]],
    ["saturate(2.5)", [{ kind: "saturate", amount: 2.5 }]],
    ["hue-rotate(120deg)", [{ kind: "hue-rotate", degrees: 120 }]],
    ["hue-rotate(0.5turn)", [{ kind: "hue-rotate", degrees: 180 }]],
    ["invert(1)", [{ kind: "invert", amount: 1 }]],
    ["sepia(60%)", [{ kind: "sepia", amount: 0.6 }]],
    ["opacity(0.5)", [{ kind: "opacity", amount: 0.5 }]],
    [
      "drop-shadow(rgba(0, 0, 0, 0.5) 0px 4px 6px)",
      [{ kind: "drop-shadow", shadow: { color: { r: 0, g: 0, b: 0, a: 0.5 }, x: 0, y: 4, blur: 6, spread: 0, inset: false } }],
    ],
    ["none", []],
  ])("%s", (input, want) => expect(parseFilters(input)).toEqual({ filters: want, unsupported: [] }));

  test("url() references are reported, the rest of the list still parses", () => {
    expect(parseFilters('url("#goo") blur(2px)')).toEqual({ filters: [{ kind: "blur", radius: 2 }], unsupported: ['url("#goo")'] });
  });
});


describe("parseClipPath", () => {
  test.each<[string, ClipShape | undefined]>([
    ["circle(40% at 50% 50%)", { kind: "circle", cx: 100, cy: 50, r: 63.25 }], // 40% of √(200²+100²)/√2
    ["circle(30px at 10px 20px)", { kind: "circle", cx: 10, cy: 20, r: 30 }],
    ["circle(closest-side at 50% 50%)", { kind: "circle", cx: 100, cy: 50, r: 50 }],
    ["circle(farthest-side at left top)", { kind: "circle", cx: 0, cy: 0, r: 200 }],
    ["circle()", { kind: "circle", cx: 100, cy: 50, r: 50 }],
    ["ellipse(45% 30% at 50% 50%)", { kind: "ellipse", cx: 100, cy: 50, rx: 90, ry: 30 }],
    ["ellipse(closest-side farthest-side at 25% 50%)", { kind: "ellipse", cx: 50, cy: 50, rx: 50, ry: 50 }],
    ["inset(10% 15% round 12px)", { kind: "inset", top: 10, right: 30, bottom: 10, left: 30, radius: 12 }],
    ["inset(5px)", { kind: "inset", top: 5, right: 5, bottom: 5, left: 5 }],
    ["inset(1px 2px 3px 4px)", { kind: "inset", top: 1, right: 2, bottom: 3, left: 4 }],
    [
      "polygon(50% 0px, 100% 38%, 82% 100%, 18% 100%, 0px 38%)",
      { kind: "polygon", points: [[100, 0], [200, 38], [164, 100], [36, 100], [0, 38]] },
    ],
    ["polygon(evenodd, 0px 0px, 100% 0px, 100% 100%)", { kind: "polygon", points: [[0, 0], [200, 0], [200, 100]] }],
    ["none", undefined],
    ['path("M0 0 H100")', undefined],
    ['url("#clip")', undefined],
    ["margin-box", undefined],
  ])("%s in 200×100", (input, want) => expect(parseClipPath(input, 200, 100)).toEqual(want));
});
