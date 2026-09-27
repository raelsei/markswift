import { expect, test } from "bun:test";
import { parseBackgroundImage, resolvePaint, type Paint } from "../../../src/css/paint.ts";

const blue = "rgb(0, 0, 255)", red = "rgb(255, 0, 0)", green = "rgb(0, 255, 0)";
const gradient = (raw: string) => {
  const paint = parseBackgroundImage(raw)[0]!;
  if (paint.kind === "unsupported" || paint.kind === "image" || paint.kind === "solid") throw new Error("Expected supported gradient");
  return paint;
};

test("CSS stop fixup preserves out-of-range positions and makes specified positions nondecreasing", () => {
  const paint = gradient(`linear-gradient(${blue} 50px, ${red} 150px, ${blue} 90%)`);
  expect((resolvePaint(paint, 100, 100) as Extract<Paint, {kind:"linear"}>).stops.map(stop=>stop.pos)).toEqual([.5, 1.5, 1.5]);
  expect(gradient(`linear-gradient(${blue} 70%, ${red} 30%, ${green})`).stops.map(stop=>stop.pos)).toEqual([.7, .7, 1]);
});

test("implicit stops are distributed after mixed-unit fixup at each actual box", () => {
  const paint = gradient(`linear-gradient(90deg, ${blue} 100px, ${red}, ${green} 50%)`);
  const small = resolvePaint(paint, 100, 80) as Extract<Paint, {kind:"linear"}>;
  const large = resolvePaint(paint, 400, 80) as Extract<Paint, {kind:"linear"}>;
  expect(small.stops.map(stop=>stop.pos)).toEqual([1, 1, 1]);
  expect(large.stops.map(stop=>stop.pos)).toEqual([.25, .375, .5]);
  expect(large.stopPositions).toEqual([{unit:"px",value:100}, null, {unit:"fraction",value:.5}]);
  expect((resolvePaint(small, 400, 80) as Extract<Paint, {kind:"linear"}>).stops).toEqual(large.stops);
});

test("double-position stops expand without losing the hard-stop source units", () => {
  const paint = gradient(`linear-gradient(90deg, ${blue} 0px 40px, ${red} 40px 100%)`);
  expect(paint.stops.map(stop=>stop.color)).toEqual([{r:0,g:0,b:1,a:1},{r:0,g:0,b:1,a:1},{r:1,g:0,b:0,a:1},{r:1,g:0,b:0,a:1}]);
  expect((resolvePaint(paint, 200, 80) as Extract<Paint,{kind:"linear"}>).stops.map(stop=>stop.pos)).toEqual([0,.2,.2,1]);
});

test("angle stops belong to conic gradients and length stops to linear/radial gradients", () => {
  expect(gradient(`conic-gradient(${blue} 0turn, ${red} .5turn, ${green} 400grad)`).stops.map(stop=>stop.pos)).toEqual([0,.5,1]);
  expect(parseBackgroundImage(`linear-gradient(${blue} 90deg, ${red})`)[0]?.kind).toBe("unsupported");
  expect(parseBackgroundImage(`conic-gradient(${blue} 20px, ${red})`)[0]?.kind).toBe("unsupported");
  expect(parseBackgroundImage(`radial-gradient(${blue} calc(20px + 10%), ${red})`)[0]?.kind).toBe("unsupported");
  expect(parseBackgroundImage(`linear-gradient(${blue}, 30%, ${red})`)[0]?.kind).toBe("unsupported");
});
