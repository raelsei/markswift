import { describe, expect, test } from "bun:test";
import { str } from "../../../src/swift/format.ts";

describe("str", () => {
  const table: Array<[string, string, string]> = [
    ["plain", "Hello", String.raw`"Hello"`],
    ["quote + backslash", 'a"b\\c', String.raw`"a\"b\\c"`],
    ["interpolation stays literal", "\\(x)", String.raw`"\\(x)"`],
    ["newline / CR / tab", "a\nb\rc\td", String.raw`"a\nb\rc\td"`],
    ["backspace", "a\bb", String.raw`"a\u{8}b"`],
    ["form feed", "a\fb", String.raw`"a\u{c}b"`],
    ["vertical tab", "a\u000bb", String.raw`"a\u{b}b"`],
    ["NUL", "a\u0000b", String.raw`"a\u{0}b"`],
    ["SOH", "x\u0001y", String.raw`"x\u{1}y"`],
    ["DEL / C1", "\u007f\u0085", String.raw`"\u{7f}\u{85}"`],
    ["line separator", "a\u2028b", String.raw`"a\u{2028}b"`],
    // Plain literals below: Bun rewrites non-ASCII inside `String.raw` templates as `\u` escapes.
    ["lone high surrogate", "a\ud800b", '"a\uFFFDb"'],
    ["lone low surrogate", "\udc00", '"\uFFFD"'],
    ["emoji pair kept", "😀", '"😀"'],
    ["non-ASCII kept", "Çağrı — ünlü", '"Çağrı — ünlü"'],
  ];
  for (const [name, input, expected] of table) {
    test(`${name} → ${expected}`, () => {
      expect(str(input)).toBe(expected);
    });
  }
});
