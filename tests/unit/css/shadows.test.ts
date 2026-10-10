import { expectClose } from "../../helpers/color.ts";
import { describe, expect, test } from "bun:test";
import { parseShadows } from "../../../src/css/index.ts";


describe("parseShadows", () => {
  test("accepts modern colors", () => {
    const [s] = parseShadows("oklch(0.623 0.214 259.815) 0px 12px 34px 0px");
    expectClose(s!.color, [43, 127, 255, 1]);
    expect(s).toMatchObject({ x: 0, y: 12, blur: 34, spread: 0, inset: false });
  });
});
