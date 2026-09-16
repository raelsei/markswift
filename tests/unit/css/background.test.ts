import { describe, expect, test } from "bun:test";
import { imageSize, parseBackgroundPosition, parseBackgroundRepeat, parseBackgroundSize, type BackgroundRepeat, type BackgroundSize } from "../../../src/css/background.ts";


describe("parseBackgroundSize", () => {
  test.each<[string, BackgroundSize | undefined]>([
    ["cover", "cover"],
    ["contain", "contain"],
    ["100px 50px", { w: 100, h: 50 }],
    ["50% 25%", { w: 100, h: 25 }],
    ["cover, 100px", "cover"],
    ["auto", undefined],
    ["100px auto", undefined],
    ["bogus", undefined],
  ])("%s without image size", (input, want) => expect(parseBackgroundSize(input, 200, 100)).toEqual(want));

  test("auto keeps the image aspect ratio when the image size is known", () => {
    expect(parseBackgroundSize("auto", 200, 100, 40, 20)).toEqual({ w: 40, h: 20 });
    expect(parseBackgroundSize("100px auto", 200, 100, 40, 20)).toEqual({ w: 100, h: 50 });
    expect(parseBackgroundSize("auto 50px", 200, 100, 40, 20)).toEqual({ w: 100, h: 50 });
    expect(parseBackgroundSize("50% auto", 200, 100, 40, 20)).toEqual({ w: 100, h: 50 });
  });
});


describe("parseBackgroundPosition", () => {
  test.each<[string, [number, number]]>([
    ["0% 0%", [0, 0]],
    ["50% 50%", [100, 50]],
    ["100% 50%", [200, 50]],
    ["10px 20px", [10, 20]],
    ["10px 50%", [10, 50]],
    ["calc(100% - 10px) calc(100% - 20px)", [190, 80]],
    ["calc(100% - 10px) 0%", [190, 0]],
    ["center", [100, 50]],
    ["left top", [0, 0]],
    ["top left", [0, 0]],
    ["right", [200, 50]],
    ["top", [100, 0]],
    ["bottom right", [200, 100]],
    ["right 10px bottom 20px", [190, 80]],
    ["right 10px top", [190, 0]],
    ["left 25% top 50%", [50, 50]],
    ["center bottom 10px", [100, 90]],
    ["", [0, 0]],
  ])("%s in 200×100", (input, want) => expect(parseBackgroundPosition(input, 200, 100)).toEqual(want));

  test("percentages and far-side offsets resolve against box − image", () => {
    expect(parseBackgroundPosition("50% 50%", 200, 100, 40, 20)).toEqual([80, 40]);
    expect(parseBackgroundPosition("100% 100%", 200, 100, 40, 20)).toEqual([160, 80]);
    expect(parseBackgroundPosition("right 10px bottom 20px", 200, 100, 40, 20)).toEqual([150, 60]);
    expect(parseBackgroundPosition("10px 20px", 200, 100, 40, 20)).toEqual([10, 20]);
  });
});


describe("parseBackgroundRepeat", () => {
  test.each<[string, BackgroundRepeat | undefined]>([
    ["repeat", "repeat"],
    ["no-repeat", "no-repeat"],
    ["repeat-x", "repeat-x"],
    ["repeat no-repeat", "repeat-x"],
    ["no-repeat repeat", "repeat-y"],
    ["space round", "repeat"],
    ["repeat, no-repeat", "repeat"],
    ["", undefined],
  ])("%s", (input, want) => expect(parseBackgroundRepeat(input)).toEqual(want));
});


describe("imageSize", () => {
  test("reads width/height or viewBox from a data: svg, nothing from rasters", () => {
    const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100' width='160' height='100'%3E%3C/svg%3E";
    expect(imageSize(svg)).toEqual({ w: 160, h: 100 });
    expect(imageSize("data:image/svg+xml,%3Csvg viewBox='0 0 20 10'%3E%3C/svg%3E")).toEqual({ w: 20, h: 10 });
    expect(imageSize(`data:image/svg+xml;base64,${Buffer.from('<svg width="8px" height="4px"/>').toString("base64")}`)).toEqual({ w: 8, h: 4 });
    expect(imageSize("data:image/png;base64,AAAA")).toBeUndefined();
    expect(imageSize("https://example.com/a.svg")).toBeUndefined();
  });
});
