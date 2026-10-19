import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
/** Adaptive compile: one light view whose colours follow the colour scheme, paired from a dark capture. */
import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

type Node = LayoutDoc["root"];
const box = (id: string, y: number, styles: Record<string, string>): Node => ({
  id,
  tag: "div",
  attrs: {},
  styles: { display: "block", ...styles },
  bounds: { x: 0, y, w: 200, h: 20 },
  children: [],
});

function page(theme: "light" | "dark", card: string, edge?: string): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "card.html",
    combo: { screen: "card", theme },
    size: { w: 200, h: 100 },
    viewport: { x: 0, y: 0, w: 200, h: 100 },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      children: [
        box("card", 0, { "background-color": card }),
        box("accent", 20, { "background-color": "rgb(0, 128, 255)" }),
        box("accent2", 40, { "background-color": "rgb(0, 128, 255)" }),
        box("lone", 60, { "background-color": "rgb(51, 178, 77)" }),
        box(
          "edge",
          80,
          edge ? { "border-top-style": "solid", "border-top-width": "2px", "border-top-color": edge } : {},
        ),
      ],
    },
  };
}

const light = page("light", "rgb(255, 255, 255)", "rgb(255, 0, 0)");
const dark = page("dark", "rgb(0, 0, 0)");
const adaptive = compileLayout(light, { name: "CardView", dark });
const tokens = adaptive.files["CardView+Tokens.swift"]!;

test("a single-use colour that differs in dark becomes an adaptive token the view references", () => {
  const name =
    /static let (\w+) = Color\.markswift\(light: \.markswift\(1\.0, 1\.0, 1\.0\), dark: \.markswift\(0\.0, 0\.0, 0\.0\)\)/.exec(
      tokens,
    )?.[1];
  expect(name).toBeDefined();
  expect(adaptive.code).toContain(`Palette.${name}`);
  expect(adaptive.code).not.toContain("Color.markswift(1.0, 1.0, 1.0)");
  expect(tokens).toContain("// 2 tokens: 1 adaptive (light/dark pairs), 1 static.");
});

test("colours identical in both themes stay static: shared ones as a token, single-use ones inline", () => {
  expect(tokens).toMatch(/static let \w+ = Color\.markswift\(0\.0, 0\.502, 1\.0\)\n/);
  expect(adaptive.code).toContain("Color.markswift(0.2, 0.698, 0.302)");
});

test("a slot only one theme paints keeps its light value and is reported once", () => {
  expect(adaptive.code).toContain("Color.markswift(1.0, 0.0, 0.0)");
  expect(adaptive.warnings).toHaveLength(1);
  expect(adaptive.warnings[0]).toMatchObject({ source: "adaptive", level: "approximated", feature: "color-scheme" });
  expect(adaptive.warnings[0]!.message).toMatch(/^1 node\(s\) differ .*: edge$/);
});

test("adaptive output previews both schemes; single-theme output keeps one preview and no warnings", () => {
  expect(adaptive.code).toContain('#Preview("CardView — Light")');
  expect(adaptive.code).toContain('#Preview("CardView — Dark")');
  expect(adaptive.code).toContain(".preferredColorScheme(.dark)");
  const single = compileLayout(light, { name: "CardView" });
  expect(single.warnings).toEqual([]);
  expect(single.code.match(/#Preview/g)).toHaveLength(1);
  expect(single.files["CardView+Tokens.swift"]).toContain("tokens, all static.");
});

test("geometry that moves between themes is reported", () => {
  const moved = structuredClone(dark);
  moved.root.children[1]!.bounds.y += 1;
  expect(
    compileLayout(light, { dark: moved })
      .warnings.map((w) => w.message)
      .join("\n"),
  ).toContain("accent");
});

test("the dark layout must be the dark capture of the same screen", () => {
  expect(() => compileLayout(dark, { dark })).toThrow();
  expect(() => compileLayout(light, { dark: { ...dark, combo: { screen: "other", theme: "dark" } } })).toThrow();
});

test("one light colour that pairs with two dark colours on a node is reported, not silently kept", () => {
  const edge = { "border-top-style": "solid", "border-top-width": "2px", "border-top-color": "rgb(255, 255, 255)" };
  const doc = (theme: "light" | "dark", fill: string): LayoutDoc => ({
    ...page(theme, fill),
    root: {
      ...page(theme, fill).root,
      children: [box("card", 0, { "background-color": fill, ...edge }), box("other", 20, edge)],
    },
  });
  const result = compileLayout(doc("light", "rgb(255, 255, 255)"), { dark: doc("dark", "rgb(0, 0, 0)") });
  expect(result.warnings.every((w) => w.source === "adaptive" && w.feature === "color-scheme")).toBe(true);
  expect(result.warnings.map((w) => w.message).join("\n")).toMatch(
    /1 node\(s\) paint a colour that changes in dark .*: card$/,
  );
});

function fieldPage(theme: "light" | "dark", prompt: string): LayoutDoc {
  const doc = page(theme, "rgb(255, 255, 255)");
  const input: Node = {
    id: "q",
    tag: "input",
    attrs: { placeholder: "Search" },
    styles: {
      display: "inline-block",
      "font-family": "system-ui",
      "font-size": "15px",
      "line-height": "20px",
      color: "rgb(17, 24, 39)",
    },
    bounds: { x: 0, y: 0, w: 200, h: 36 },
    children: [],
    pseudoStyles: { placeholder: { color: prompt, "-webkit-text-fill-color": prompt, opacity: "1" } },
  };
  return { ...doc, combo: { screen: "field", theme }, root: { ...doc.root, children: [input] } };
}

test("a placeholder colour that changes in dark becomes an adaptive token on the prompt", () => {
  const field = compileLayout(fieldPage("light", "rgb(115, 115, 115)"), {
    name: "FieldView",
    dark: fieldPage("dark", "rgb(161, 161, 161)"),
  });
  const name =
    /static let (\w+) = Color\.markswift\(light: \.markswift\(0\.451, 0\.451, 0\.451\), dark: \.markswift\(0\.631, 0\.631, 0\.631\)\)/.exec(
      field.files["FieldView+Tokens.swift"]!,
    )?.[1];
  expect(name).toBeDefined();
  expect(field.code).toContain(`prompt: Text(verbatim: "Search").foregroundStyle(Palette.${name})`);
  expect(field.warnings).toEqual([]);
});

test("a root color-scheme naming one scheme forces the view's appearance; an adaptive pair only when both agree", () => {
  const scheme = (theme: "light" | "dark", value?: string): LayoutDoc => {
    const doc = page(theme, theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
    if (value) doc.root.styles["color-scheme"] = value;
    return doc;
  };
  const forced = String.raw`.environment(\.colorScheme, .dark)`;
  for (const mode of ["app", "fidelity"] as const) {
    for (const value of ["dark", "dark only"]) {
      const code = compileLayout(scheme("light", value), { mode }).code;
      expect(code.split(forced).length - 1).toBe(1);
    }
    for (const value of ["light dark", undefined])
      expect(compileLayout(scheme("light", value), { mode }).code).not.toContain(
        String.raw`.environment(\.colorScheme`,
      );
  }
  expect(compileLayout(scheme("light", "normal"), { dark: scheme("dark", "dark") }).code).not.toContain(
    String.raw`.environment(\.colorScheme`,
  );
  expect(compileLayout(scheme("light", "dark"), { dark: scheme("dark", "dark") }).code).toContain(forced);
});

test("nested single-scheme containers force only their subtree and adaptive pairs must agree", () => {
  const scheme = (theme: "light" | "dark", value: string) => {
    const doc = page(theme, "rgb(255,255,255)");
    doc.root.children[0]!.styles["color-scheme"] = value;
    return doc;
  };
  const forced = String.raw`.environment(\.colorScheme, .dark)`;
  for (const mode of ["app", "fidelity"] as const) {
    expect(compileLayout(scheme("light", "dark only"), { mode }).code.split(forced)).toHaveLength(2);
    expect(compileLayout(scheme("light", "light dark"), { mode }).code).not.toContain(forced);
  }
  expect(compileLayout(scheme("light", "dark"), { dark: scheme("dark", "dark") }).code).toContain(forced);
  expect(compileLayout(scheme("light", "dark"), { dark: scheme("dark", "light") }).code).not.toContain(forced);
});

test("a nested multi-scheme boundary restores the caller's appearance inside a dark-only root", () => {
  const doc = page("light", "rgb(255,255,255)");
  doc.root.styles["color-scheme"] = "dark";
  doc.root.children[0]!.styles["color-scheme"] = "light dark";
  const code = compileLayout(doc).code;
  expect(code).toContain(".modifier(MarkswiftRestoreColorScheme())");
  expect(code).toContain(".modifier(MarkswiftColorSchemeScope())");
  expect(code).toContain(String.raw`.environment(\.colorScheme, .dark)`);
});
