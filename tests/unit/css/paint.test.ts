import type { Color } from "../../../src/css/color.ts";
import { expectClose } from "../../helpers/color.ts";
import { describe, expect, test } from "bun:test";
import { paintWithin, parseBackgroundImage, resolvePaint, type Paint } from "../../../src/css/paint.ts";


describe("parseBackgroundImage", () => {
  const red = { r: 1, g: 0, b: 0, a: 1 }, blue = { r: 0, g: 0, b: 1, a: 1 };

  test("plain gradients carry no repeating key (regression)", () => {
    expect(parseBackgroundImage("linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))")).toEqual([
      { kind: "linear", angle: 90, stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }] },
    ]);
    expect(parseBackgroundImage("radial-gradient(circle at 25% 75%, rgb(255, 0, 0), rgb(0, 0, 255))")).toEqual([
      { kind: "radial", stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }], center: [0.25, 0.75], ellipse: false },
    ]);
  });

  test("repeating gradients keep their shape and set repeating", () => {
    const [lin] = parseBackgroundImage("repeating-linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255) 20%)");
    expect(lin).toMatchObject({ kind: "linear", angle: 90, repeating: true });
    const [rad] = parseBackgroundImage("repeating-radial-gradient(circle at 25% 75%, rgb(255, 0, 0), rgb(0, 0, 255) 30px)");
    expect(rad).toMatchObject({ kind: "radial", center: [0.25, 0.75], ellipse: false, repeating: true });
    const [con] = parseBackgroundImage(
      "repeating-conic-gradient(from 90deg at 25% 75%, rgb(255, 0, 0) 0deg, rgb(255, 0, 0) 25%, rgb(0, 0, 255) 25%, rgb(0, 0, 255) 50%)",
    );
    expect(con).toMatchObject({ kind: "conic", from: 90, center: [0.25, 0.75], repeating: true });
    expect((con as Extract<Paint, { kind: "conic" }>).stops.map((s) => s.pos)).toEqual([0, 0.25, 0.25, 0.5]);
  });

  test("conic from/at forms Chrome emits", () => {
    expect(parseBackgroundImage("conic-gradient(from 45deg, rgb(255, 0, 0), rgb(0, 0, 255))")[0]).toMatchObject({ kind: "conic", from: 45, center: [0.5, 0.5] });
    expect(parseBackgroundImage("conic-gradient(from 57.2958deg, rgb(255, 0, 0), rgb(0, 0, 255))")[0]).toMatchObject({ from: 57.2958 });
    expect(parseBackgroundImage("conic-gradient(at 0% 0%, rgb(255, 0, 0), rgb(0, 0, 255))")[0]).toMatchObject({ from: 0, center: [0, 0] });
    expect(parseBackgroundImage("conic-gradient(from 0.25turn at right bottom, red, blue)")[0]).toMatchObject({ from: 90, center: [1, 1] });
    expect(parseBackgroundImage("conic-gradient(rgb(255, 0, 0), rgb(0, 0, 255))")[0]).toMatchObject({ from: 0, center: [0.5, 0.5] });
  });

  test("url layers become image paints, bottom-most first", () => {
    expect(parseBackgroundImage('url("https://example.com/a.png"), linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))')).toEqual([
      { kind: "linear", angle: 180, stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }] },
      { kind: "image", url: "https://example.com/a.png" },
    ]);
    expect(parseBackgroundImage('url("a b.png")')).toEqual([{ kind: "image", url: "a b.png" }]);
    expect(parseBackgroundImage("url(a.png)")).toEqual([{ kind: "image", url: "a.png" }]);
    expect(parseBackgroundImage('url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\"/>")')).toEqual([
      { kind: "image", url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>' },
    ]);
  });

  test("modern color stops parse", () => {
    const [p] = parseBackgroundImage("linear-gradient(90deg, oklch(0.623 0.214 259.815), color(display-p3 1 0 0) 50%)") as [Extract<Paint, { kind: "linear" }>];
    expect(p.stops).toHaveLength(2);
    expect(p.stops[1]).toEqual({ color: { r: 1, g: 0, b: 0, a: 1 }, pos: 0.5 });
    expectClose(p.stops[0]!.color, [43, 127, 255, 1]);
  });

  test("unknown layers stay unsupported", () => {
    expect(parseBackgroundImage("image-set(url(a.png) 1x)")).toEqual([{ kind: "unsupported", raw: "image-set(url(a.png) 1x)" }]);
    expect(parseBackgroundImage("none")).toEqual([]);
  });
});


describe("resolvePaint", () => {
  const navy: Color = { r: 0, g: 0, b: 1, a: 1 };
  test("px stops of a repeating gradient become fractions of the gradient line, period kept", () => {
    // Chrome expands `#1e293b 0 8px, #64748b 8px 16px` into four single-position stops.
    const [p] = parseBackgroundImage("repeating-linear-gradient(45deg, rgb(0, 0, 255) 0px, rgb(0, 0, 255) 8px, rgb(255, 0, 0) 8px, rgb(255, 0, 0) 16px)");
    expect((p as Extract<Paint, { kind: "linear" }>).stops.map((s) => s.pos)).toEqual([undefined, undefined, undefined, undefined]);
    const r = resolvePaint(p!, 100, 100) as Extract<Paint, { kind: "linear" }>;
    // Gradient line at 45° on a 100×100 box = 100·(sin 45° + cos 45°) ≈ 141.42px.
    expect(r.stops.map((s) => s.pos)).toEqual([0, 0.0566, 0.0566, 0.1131]);
    expect(r.repeating).toBe(true);
    expect(r.stops.every((s) => s.px === undefined)).toBe(true);
  });
  test("non-repeating px stops clamp to the line and mix with percentages", () => {
    const [p] = parseBackgroundImage("linear-gradient(rgb(0, 0, 255) 50px, rgb(255, 0, 0) 150px, rgb(0, 0, 255) 90%)");
    const r = resolvePaint(p!, 100, 100) as Extract<Paint, { kind: "linear" }>;
    expect(r.stops.map((s) => s.pos)).toEqual([0.5, 1, 0.9]);
    expect(r.stops[0]!.color).toEqual(navy);
  });
  test("radial px stops resolve against the farthest corner", () => {
    const [p] = parseBackgroundImage("radial-gradient(circle at 0% 0%, rgb(0, 0, 255) 0px, rgb(255, 0, 0) 50px)");
    const r = resolvePaint(p!, 30, 40) as Extract<Paint, { kind: "radial" }>;
    expect(r.stops.map((s) => s.pos)).toEqual([0, 1]);
  });
  test("paints without px stops pass through untouched", () => {
    const [p] = parseBackgroundImage("linear-gradient(rgb(0, 0, 255), rgb(255, 0, 0))");
    expect(resolvePaint(p!, 10, 10)).toBe(p!);
  });
});


describe("paintWithin", () => {
  const red: Color = { r: 1, g: 0, b: 0, a: 1 };
  const blue: Color = { r: 0, g: 0, b: 1, a: 1 };
  test("a horizontal gradient over the block is cut to the glyph run's span", () => {
    // Block 0..200 wide, run covers the left half: the run sees the first half of the ramp.
    const p: Paint = { kind: "linear", angle: 90, stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }] };
    const cut = paintWithin(p, { x: 0, y: 0, w: 200, h: 40 }, { x: 0, y: 0, w: 100, h: 40 }) as Extract<Paint, { kind: "linear" }>;
    expect(cut.stops).toEqual([{ color: red, pos: 0 }, { color: { r: 0.5, g: 0, b: 0.5, a: 1 }, pos: 1 }]);
  });
  test("interior stops keep their place, the run's edges interpolate", () => {
    const p: Paint = { kind: "linear", angle: 90, stops: [{ color: red, pos: 0 }, { color: blue, pos: 0.5 }, { color: red, pos: 1 }] };
    const cut = paintWithin(p, { x: 0, y: 0, w: 200, h: 40 }, { x: 50, y: 0, w: 100, h: 40 }) as Extract<Paint, { kind: "linear" }>;
    expect(cut.stops.map((s) => s.pos)).toEqual([0, 0.5, 1]);
    expect(cut.stops[0]!.color).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    expect(cut.stops[1]!.color).toEqual(blue);
  });
  test("vertical gradients ignore the horizontal offset; radial centers shift", () => {
    const p: Paint = { kind: "linear", angle: 180, stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }] };
    expect(paintWithin(p, { x: 0, y: 0, w: 200, h: 40 }, { x: 80, y: 0, w: 50, h: 40 })).toEqual(p);
    const r: Paint = { kind: "radial", stops: [{ color: red, pos: 0 }, { color: blue, pos: 1 }], center: [0.5, 0.5], ellipse: true };
    expect(paintWithin(r, { x: 0, y: 0, w: 200, h: 40 }, { x: 0, y: 0, w: 100, h: 40 })).toMatchObject({ center: [1, 0.5] });
  });
});
