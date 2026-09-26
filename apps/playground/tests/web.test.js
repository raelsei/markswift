import { expect, test } from "bun:test";
import { inputSnapshot, validateInput } from "../web/input.js";
import { mappingSummary } from "../web/report.js";

function fields(layout = "single") {
  return Object.fromEntries(Object.entries({
    html: "<main>Hello</main>", css: "", name: " CardView ", mode: "app", theme: "light",
    width: "393", height: "852", layout, compactWidth: "320", breakpoint: "350",
  }).map(([name, value]) => [name, { value }]));
}

test("single-width snapshot omits inactive responsive values; responsive includes a numeric pair", () => {
  const single = fields();
  single.compactWidth.value = "broken";
  expect(validateInput(inputSnapshot(single))).toEqual({
    html: "<main>Hello</main>", css: "", name: "CardView", mode: "app", theme: "light", viewport: { width: 393, height: 852 },
  });
  expect(validateInput(inputSnapshot(fields("responsive")))).toMatchObject({ compactWidth: 320, breakpoint: 350 });
});

test("responsive UI validation prevents invalid pairs without changing single capture bounds", () => {
  const input = inputSnapshot(fields("responsive"));
  for (const changes of [{ compactWidth: 351 }, { breakpoint: 393 }, { compactWidth: 239 }, { breakpoint: 350.5 }]) {
    expect(() => validateInput({ ...input, ...changes })).toThrow();
  }
  expect(validateInput({ ...input, compactWidth: 350 })).toMatchObject({ compactWidth: 350 });
  expect(() => validateInput({ ...input, viewport: { width: 393, height: 239 } })).toThrow("height");
});

test("responsive summary keeps branch mappings separate instead of claiming one overall percentage", () => {
  expect(mappingSummary({ branches: [
    { branch: "compact", mapping: { mapped: 1, total: 2 } },
    { branch: "regular", mapping: { mapped: 3, total: 3 } },
  ] })).toBe("Compact 1/2 · Regular 3/3 mapped");
  expect(mappingSummary({ mapping: { mapped: 1, total: 2 } })).toBe("1/2 mapped · 50.0% nodes");
});
