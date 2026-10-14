import { describe, expect, test } from "bun:test";
import { fontExpr, memberName, pascalWords, str } from "../../../src/swift/format.ts";
import { fontOf } from "../../../src/analysis/typography.ts";
import { bundledFamilies } from "../../../src/fonts/metadata.ts";
import type { FontPackage, PackagedFace } from "../../../src/fonts/types.ts";

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

test("pascalWords and memberName build K1 member names", () => {
  expect(pascalWords("openMenu")).toBe("OpenMenu");
  expect(pascalWords("save-btn")).toBe("SaveBtn");
  expect(pascalWords("Gönder")).toBe("Gonder");
  expect(pascalWords("—")).toBe("");
  const seen: Record<string, number> = {};
  expect(memberName("on", "Edit", seen, "Action")).toBe("onEdit");
  expect(memberName("on", "Edit", seen, "Action")).toBe("onEdit2");
  expect(memberName("on", "", seen, "Action")).toBe("onAction");
  expect(memberName("is", "Save", seen, "Control", "Pressed")).toBe("isSavePressed");
});

test("043 item 11: a bundled family without a wght axis selects its static face in fidelity; app keeps Dynamic Type", () => {
  const face = (weight: number, axes: Record<string, [number, number]>): PackagedFace => ({
    family: "Fam",
    file: `fam-${weight}.ttf`,
    style: "normal",
    weight: [weight, weight],
    axes,
    metrics: { upem: 1000, ascent: 800, descent: 200, lineGap: 0, useTypoMetrics: false },
    converted: false,
    renamed: false,
  });
  const pkg = (faces: PackagedFace[]): FontPackage => ({ faces, assets: {}, plist: "", notes: [] });
  const bold = { "font-family": "Fam", "font-size": "18px", "font-weight": "700" };
  const staticFont = fontOf(bold, bundledFamilies(pkg([face(400, {}), face(700, {})])));
  const variableFont = fontOf(bold, bundledFamilies(pkg([face(100, { wght: [100, 900] })])));
  expect(fontExpr(staticFont, { mode: "fidelity" })).toBe('.custom("Fam", fixedSize: 18.0).weight(.bold)');
  expect(fontExpr(variableFont, { mode: "fidelity" })).toBe('.markswiftVariable("Fam", size: 18.0, weight: 700.0)');
  for (const f of [staticFont, variableFont])
    expect(fontExpr(f, { mode: "app" })).toBe('.custom("Fam", size: 18.0, relativeTo: .body).weight(.bold)');
});
