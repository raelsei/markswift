import { describe, expect, test } from "bun:test";
import { parseBlendMode, parseBlendModes, type BlendMode } from "../../../src/css/blend.ts";


describe("parseBlendMode", () => {
  test.each<[string | undefined, BlendMode | undefined]>([
    ["normal", "normal"],
    ["multiply", "multiply"],
    ["color-dodge", "color-dodge"],
    ["plus-lighter", "plus-lighter"],
    ["  LUMINOSITY ", "luminosity"],
    ["plus-darker", "plus-darker"],
    // Not a `<blend-mode>`: a compositing operator, and `isolation`'s value.
    ["source-over", undefined],
    ["isolate", undefined],
    ["", undefined],
    [undefined, undefined],
  ])("%s", (input, want) => expect(parseBlendMode(input)).toEqual(want));
});


describe("parseBlendModes", () => {
  test("one keyword per background layer, CSS order (top-most first)", () => {
    expect(parseBlendModes("color, multiply, normal")).toEqual(["color", "multiply", "normal"]);
  });
  test("an unrecognised keyword degrades to normal, so no layer is dropped", () => {
    expect(parseBlendModes("darken, nonsense")).toEqual(["darken", "normal"]);
  });
  test("no declaration is no layers", () => {
    expect(parseBlendModes(undefined)).toEqual([]);
    expect(parseBlendModes("")).toEqual([]);
  });
});
