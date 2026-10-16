/** Plan 055 (M1, decision A): band 0's in-flow layers join the merged breakpoint screen once, before tokens. */
import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, Theme } from "../../../src/model/layout.ts";
import { band, el, txt } from "../../helpers/bands.ts";

/**
 * `.wrap` (its `.only-wide` child exists from 600px up when `wide`) and a closed `<details id="faq">`, inside `.wrap`
 * when `inside`. Band 0 carries the `more` layer and the summary's open paint; band 1 carries neither.
 */
const page = (w: number, theme: Theme, { wide = true, inside = false } = {}): LayoutDoc => {
  const zero = w < 600;
  const details = el("faq", "details", { x: 0, y: 40, w, h: 20 }, {}, [
    el(
      "faq/0",
      "summary",
      { x: 0, y: 40, w, h: 20 },
      { display: "list-item" },
      [txt("More", w)],
      zero ? { states: { open: { color: "rgb(0, 0, 255)" } } } : {},
    ),
  ]);
  const wrap = el("wrap", "div", { x: 0, y: 0, w, h: 40 }, {}, [
    el("wrap/p", "p", { x: 0, y: 0, w, h: 20 }, {}, [txt("Text", w)]),
    ...(wide && !zero ? [el("only-wide", "aside", { x: 0, y: 20, w, h: 20 }, {}, [txt("Side", w)])] : []),
    ...(inside ? [details] : []),
  ]);
  const doc = band(w, inside ? [wrap] : [wrap, details], undefined, theme);
  if (zero)
    doc.layers = [
      {
        id: "more",
        trigger: "faq/0",
        activation: "click",
        relation: "details",
        modal: false,
        placement: "inflow",
        parent: "faq",
        index: 1,
        nodes: [
          el(
            "faq/1",
            "p",
            { x: 0, y: 60, w, h: 20 },
            { color: theme === "light" ? "rgb(200, 0, 0)" : "rgb(0, 200, 0)" },
            [txt("Answer", w)],
          ),
        ],
        dismiss: { escape: false, outside: false, buttons: [] },
      },
    ];
  return doc;
};
const compile = (options: { wide?: boolean; inside?: boolean } = {}) =>
  compileLayout(page(390, "light", options), {
    variants: [page(834, "light", options)],
    dark: page(390, "dark", options),
    darkVariants: [page(834, "dark", options)],
  });
const count = (code: string, s: string) => code.split(s).length - 1;

test("a disclosure outside every alternative is one member that opens in every band", () => {
  const r = compile();
  expect(r.code).toContain("MarkswiftBands(");
  expect(count(r.code, "@State private var isMoreExpanded")).toBe(1);
  expect(count(r.code, "isMoreExpanded: Bool = false")).toBe(1);
  expect(count(r.code, "DisclosureGroup(isExpanded: $isMoreExpanded)")).toBe(1);
  const chain = /\n( +)Group \{\n\1 {4}if band[\s\S]*?\n\1\}\n/.exec(r.code)?.[0];
  expect(chain).toBeDefined();
  expect(chain).not.toContain("DisclosureGroup");
  expect(r.openStates).toEqual({ more: "isMoreExpanded" });
  // The answer's light/dark pair (band 0 only) binds a palette token.
  const token =
    /static let (\w+) = Color\.markswift\(light: \.markswift\(0\.784, 0\.0, 0\.0\), dark: \.markswift\(0\.0, 0\.784, 0\.0\)\)/.exec(
      r.files["ConvertedView+Tokens.swift"]!,
    )?.[1];
  expect(token).toBeDefined();
  expect(r.code).toMatch(new RegExp(`Text\\(verbatim: "Answer"\\)[^\\n]*\\.foregroundStyle\\(Palette\\.${token}\\)`));
  expect(r.warnings).toEqual([]);
});

test("a disclosure inside a breakpoint alternative is reported, not emitted", () => {
  const r = compile({ inside: true });
  expect(r.code).toContain("MarkswiftBands(");
  expect(r.code).not.toContain("isMoreExpanded");
  expect(
    r.warnings.filter((w) => w.message.includes("layer more is not emitted inside a breakpoint alternative")),
  ).toEqual([
    {
      source: "breakpoints",
      level: "approximated",
      feature: "media-query",
      message:
        "layer more is not emitted inside a breakpoint alternative (its trigger or parent differs between width bands)",
    },
  ]);
});

test("bands that merge to nothing compile byte-equal to band 0 alone, layers included", () => {
  const r = compile({ wide: false });
  const alone = compileLayout(page(390, "light", { wide: false }), { dark: page(390, "dark", { wide: false }) });
  expect(r.code).toBe(alone.code);
  expect(r.files).toEqual(alone.files);
  expect(r.code).toContain("DisclosureGroup(isExpanded: $isMoreExpanded)");
});
