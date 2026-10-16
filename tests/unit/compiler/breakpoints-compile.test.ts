/** Plan 054: `compileLayout` with width-band variants. */
import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { Theme } from "../../../src/model/layout.ts";
import { band, el, txt } from "../../helpers/bands.ts";

/** A section whose `#wide` child exists from 600px up, painting red in light and blue in dark. */
const page = (w: number, theme: Theme = "light", wide = w > 600) =>
  band(
    w,
    [
      el("head", "header", { x: 0, y: 0, w, h: 20 }, {}, [txt("Title", w)]),
      el("s", "section", { x: 0, y: 20, w, h: 40 }, {}, [
        el("a", "p", { x: 0, y: 20, w, h: 20 }, {}, [txt("A", w)]),
        ...(wide
          ? [
              el(
                "wide",
                "div",
                { x: 0, y: 40, w, h: 20 },
                { "background-color": theme === "light" ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)" },
                [txt("Only wide", w)],
              ),
            ]
          : []),
      ]),
    ],
    undefined,
    theme,
  );

test("variants that merge to nothing compile byte-equal to the layout alone", () => {
  const alone = compileLayout(page(390, "light", false));
  const merged = compileLayout(page(390, "light", false), { variants: [page(834, "light", false)] });
  expect(merged.code).toBe(alone.code);
  expect(merged.files).toEqual(alone.files);
  expect(merged.warnings).toEqual(alone.warnings);
});

test("a two-band set emits one MarkswiftBands view", () => {
  const r = compileLayout(page(390), { variants: [page(834)] });
  expect(r.code).toContain("MarkswiftBands(edges: [.atLeast(600.0)]) { band in");
});

test("variants are validated: ascending widths, one dark capture per variant", () => {
  expect(() => compileLayout(page(834), { variants: [page(390)] })).toThrow(
    "options.variants must be captures of the screen and theme of layout at ascending viewport widths",
  );
  expect(() => compileLayout(page(390), { variants: [page(834)], dark: page(390, "dark") })).toThrow(
    "options.darkVariants must hold one dark capture per variant, exactly when options.dark is set",
  );
});

test("a band-1-only node whose colour changes in dark binds the adaptive token", () => {
  const r = compileLayout(page(390), {
    variants: [page(834)],
    dark: page(390, "dark"),
    darkVariants: [page(834, "dark")],
  });
  const tokens = r.files["ConvertedView+Tokens.swift"]!;
  const name =
    /static let (\w+) = Color\.markswift\(light: \.markswift\(1\.0, 0\.0, 0\.0\), dark: \.markswift\(0\.0, 0\.0, 1\.0\)\)/.exec(
      tokens,
    )?.[1];
  expect(name).toBeDefined();
  expect(r.code).toContain(`.background(Palette.${name}`);
  expect(r.warnings).toEqual([]);
});
