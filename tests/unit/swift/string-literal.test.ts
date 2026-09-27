import { expect, test } from "bun:test";
import { str } from "../../../src/swift/format.ts";

test("Swift string literals use valid Unicode scalar escapes for control characters", () => {
  expect(str("\b\f\v\0\u001b")).toBe('"\\u{8}\\u{c}\\u{b}\\u{0}\\u{1b}"');
  expect(str('quote" slash\\ newline\n tab\t cr\r')).toBe('"quote\\" slash\\\\ newline\\n tab\\t cr\\r"');
});
test("source interpolation and Unicode scalars retain their literal value", () => {
  expect(str('\\(fatalError("injected"))')).toBe('"\\\\(fatalError(\\"injected\\"))"');
  expect(str("🍭 café\u00a0match")).toBe('"🍭 café\u00a0match"');
});
test("unpaired UTF16 surrogates fail explicitly instead of generating invalid Swift", () => {
  expect(() => str("\ud800")).toThrow("unpaired UTF-16 surrogate");
  expect(() => str("\udc00")).toThrow("unpaired UTF-16 surrogate");
});
