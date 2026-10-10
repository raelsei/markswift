/**
 * Token extraction: what a consumer of `MarkswiftTokens.swift` observes — which colours become
 * named tokens, whether a name follows the design's own vocabulary, and that two runs of the
 * same design produce the same file.
 */
import { describe, expect, test } from "bun:test";
import { extractTokens, emitDesignTokens, camelize, screenBase, screenTokens } from "../../../src/swift/tokens.ts";
import { colorExpr } from "../../../src/swift/format.ts";
import type { ColorCtx } from "../../../src/swift/context.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { Color } from "../../../src/css/index.ts";
import type { Screen, SemNode, StackNode, Style, TextRun } from "../../../src/model/semantic.ts";

const rgb = (r: number, g: number, b: number, a = 1): Color => ({ r, g, b, a });

const WHITE = rgb(1, 1, 1);
const NEAR_BLACK = rgb(0.04, 0.06, 0.08);
const INDIGO = rgb(0.49, 0.36, 0.84);

function style(over: Partial<Style> = {}): Style {
  return { fills: [], shadows: [], ...over };
}

let nextId = 0;
function box(over: { id?: string; style?: Style } = {}): SemNode {
  return {
    kind: "box",
    id: over.id ?? `n${nextId++}`,
    frame: { x: 0, y: 0, w: 10, h: 10 },
    width: { kind: "fixed", px: 10 },
    height: { kind: "fixed", px: 10 },
    padding: [0, 0, 0, 0],
    style: over.style ?? style(),
    confidence: "mapped",
    notes: [],
    overlays: [],
  };
}

function text(id: string, color: Color): SemNode {
  const run: TextRun = { text: "x", color, font: { family: { kind: "system", design: "default" }, size: 14, weight: 400 } };
  return { ...(box({ id }) as object), kind: "text", runs: [run], align: "leading", lines: 1 } as SemNode;
}

function screen(theme: "light" | "dark", children: SemNode[], canvas: Color): Screen {
  const root: StackNode = {
    kind: "stack",
    id: "root",
    frame: { x: 0, y: 0, w: 393, h: 100 },
    width: { kind: "fill" },
    height: { kind: "fill" },
    padding: [0, 0, 0, 0],
    style: style(),
    confidence: "mapped",
    notes: [],
    overlays: [],
    axis: "v",
    spacing: 0,
    align: "start",
    distribution: "start",
    leadInset: 0,
    children,
  };
  return { version: 1, name: `home-${theme}`, source: "t.html", theme, size: { w: 393, h: 100 }, canvas, root };
}

/** A design whose card fill flips with the theme and whose accent is theme-independent. */
function pair(): Screen[] {
  nextId = 0;
  const light = screen(
    "light",
    [
      box({ id: "card", style: style({ fills: [{ kind: "solid", color: WHITE }] }) }),
      box({ id: "accent", style: style({ fills: [{ kind: "solid", color: INDIGO }] }) }),
      box({ id: "accent2", style: style({ fills: [{ kind: "solid", color: INDIGO }] }) }),
    ],
    rgb(0.96, 0.96, 0.98),
  );
  nextId = 0;
  const dark = screen(
    "dark",
    [
      box({ id: "card", style: style({ fills: [{ kind: "solid", color: NEAR_BLACK }] }) }),
      box({ id: "accent", style: style({ fills: [{ kind: "solid", color: INDIGO }] }) }),
      box({ id: "accent2", style: style({ fills: [{ kind: "solid", color: INDIGO }] }) }),
    ],
    rgb(0.04, 0.05, 0.07),
  );
  return [light, dark];
}

describe("extractTokens", () => {
  test("a colour that flips with the theme becomes a semantic token carrying both values", () => {
    const set = extractTokens(pair());
    const card = set.tokens.find((t) => t.uses.includes("card"));
    expect(card?.kind).toBe("semantic");
    expect(card?.light).toEqual(WHITE);
    expect(card?.dark).toEqual(NEAR_BLACK);
  });

  test("a theme-independent colour used twice becomes a static token with both nodes listed", () => {
    const set = extractTokens(pair());
    const accent = set.tokens.find((t) => t.uses.includes("accent"));
    expect(accent?.kind).toBe("static");
    expect(accent?.light).toEqual(accent!.dark);
    expect(accent?.uses).toEqual(["accent", "accent2"]);
  });

  test("a theme-independent colour used once stays inline", () => {
    const [light, dark] = pair();
    const lone = { kind: "solid" as const, color: rgb(0.2, 0.7, 0.3) };
    (light!.root as StackNode).children.push(box({ id: "lone", style: style({ fills: [lone] }) }));
    (dark!.root as StackNode).children.push(box({ id: "lone", style: style({ fills: [lone] }) }));
    const set = extractTokens([light!, dark!]);
    expect(set.tokens.some((t) => t.uses.includes("lone"))).toBe(false);
    expect(set.inlineSlots).toBeGreaterThan(0);
  });

  test("the screen canvas is a token of its own", () => {
    const set = extractTokens(pair());
    const canvas = set.tokens.find((t) => t.role === "canvas");
    expect(canvas?.kind).toBe("semantic");
    expect(canvas?.name).toBe("canvas");
  });

  test("a light-only screen yields no semantic tokens — nothing proves a colour changes", () => {
    const [light] = pair();
    const set = extractTokens([light!]);
    expect(set.tokens.every((t) => t.kind === "static")).toBe(true);
  });

  test("the design's own custom-property name wins over the derived one", () => {
    const [light, dark] = pair();
    for (const s of [light!, dark!]) {
      const card = (s.root as StackNode).children[0]!;
      card.style.tokens = ["surface-raised"];
    }
    const set = extractTokens([light!, dark!]);
    expect(set.tokens.find((t) => t.uses.includes("card"))?.name).toBe("surfaceRaised");
  });

  test("names are unique even when two tokens derive the same base", () => {
    const set = extractTokens(pair());
    expect(new Set(set.tokens.map((t) => t.name)).size).toBe(set.tokens.length);
  });

  test("text colours are tokenised from the runs", () => {
    const [light, dark] = pair();
    (light!.root as StackNode).children.push(text("label", NEAR_BLACK), text("label2", NEAR_BLACK));
    (dark!.root as StackNode).children.push(text("label", WHITE), text("label2", WHITE));
    const set = extractTokens([light!, dark!]);
    const label = set.tokens.find((t) => t.uses.includes("label"));
    expect(label?.role).toBe("text");
    expect(label?.kind).toBe("semantic");
    expect(label?.uses).toEqual(["label", "label2"]);
  });

  test("the same design emits the same file twice", () => {
    expect(emitDesignTokens(extractTokens(pair()))).toBe(emitDesignTokens(extractTokens(pair())));
  });

  test("a colour that flips with the theme is semantic even on a single slot", () => {
    const set = extractTokens(pair());
    const card = set.tokens.find((t) => t.uses.includes("card"));
    expect(card?.slots).toBe(1);
    expect(card?.kind).toBe("semantic");
  });
});

describe("emitDesignTokens", () => {
  test("semantic tokens emit the pair, static ones a single colour", () => {
    const swift = emitDesignTokens(extractTokens(pair()));
    expect(swift).toContain("static let canvas = Color(light: .markswift(0.96, 0.96, 0.98), dark: .markswift(0.04, 0.05, 0.07))");
    expect(swift).toMatch(/static let fill\w+ = Color\.markswift\(0\.49, 0\.36, 0\.84\)\n/);
    expect(swift).toContain("nonisolated init(light: Color, dark: Color)");
  });
});

describe("naming helpers", () => {
  test("camelize produces valid, non-keyword Swift members", () => {
    expect(camelize("surface-raised")).toBe("surfaceRaised");
    expect(camelize("ink")).toBe("ink");
    expect(camelize("2xl-shadow")).not.toMatch(/^\d/);
    expect(camelize("static")).not.toBe("static");
  });

  test("screenBase strips the theme suffix so the two themes pair", () => {
    const [light, dark] = pair();
    expect(screenBase(light!)).toBe("home");
    expect(screenBase(dark!)).toBe(screenBase(light!));
  });
});

/**
 * A design where one value is two tokens on one node: the card's fill flips with the theme
 * (semantic, white in light) while its border is white in both (static, shared with `other`).
 */
function ambiguousPair(): Screen[] {
  const white = { width: 1, color: WHITE };
  nextId = 0;
  const light = screen(
    "light",
    [box({ id: "card", style: style({ fills: [{ kind: "solid", color: WHITE }], border: white }) }), box({ id: "other", style: style({ border: white }) })],
    rgb(0.96, 0.96, 0.98),
  );
  nextId = 0;
  const dark = screen(
    "dark",
    [box({ id: "card", style: style({ fills: [{ kind: "solid", color: NEAR_BLACK }], border: white }) }), box({ id: "other", style: style({ border: white }) })],
    rgb(0.04, 0.05, 0.07),
  );
  return [light, dark];
}

describe("colorExpr", () => {
  const [light, dark] = pair();
  const set = extractTokens([light!, dark!]);
  const card = set.tokens.find((t) => t.uses.includes("card"))!;
  const accent = set.tokens.find((t) => t.uses.includes("accent"))!;
  const lightCtx: ColorCtx = { tokens: screenTokens(set, light!), mode: "fidelity" };
  const darkCtx: ColorCtx = { tokens: screenTokens(set, dark!), mode: "fidelity" };

  const table: Array<[string, Color, string | undefined, ColorCtx, string]> = [
    ["a semantic token's light value, on the node that paints it", WHITE, "card", lightCtx, `Color.${card.name}`],
    ["the same token's dark value in the dark view — one name, both themes", NEAR_BLACK, "card", darkCtx, `Color.${card.name}`],
    ["a static token on one of its nodes", INDIGO, "accent", lightCtx, `Color.${accent.name}`],
    ["a token colour on a node that does not paint it", WHITE, "accent", lightCtx, "Color.markswift(1.0, 1.0, 1.0)"],
    ["a colour with no node to attribute it to", WHITE, undefined, lightCtx, "Color.markswift(1.0, 1.0, 1.0)"],
    ["a colour no token names", rgb(0.2, 0.7, 0.3), "card", lightCtx, "Color.markswift(0.2, 0.7, 0.3)"],
    ["a colour emitted without a token set", WHITE, "card", { mode: "fidelity" }, "Color.markswift(1.0, 1.0, 1.0)"],
    ["translucency is part of the identity", rgb(1, 1, 1, 0.5), "card", lightCtx, "Color.markswift(1.0, 1.0, 1.0, 0.5)"],
  ];
  for (const [name, c, id, ctx, expected] of table) {
    test(`${name} → ${expected}`, () => {
      expect(colorExpr(c, ctx, id)).toBe(expected);
    });
  }

  test("a value two tokens claim on one node stays a literal, and still resolves where it is unambiguous", () => {
    const [l, d] = ambiguousPair();
    const amb = extractTokens([l!, d!]);
    const ctx: ColorCtx = { tokens: screenTokens(amb, l!), mode: "fidelity" };
    const border = amb.tokens.find((t) => t.kind === "static" && t.role === "border")!;
    const card = amb.tokens.find((t) => t.kind === "semantic" && t.role === "fill")!;
    expect(colorExpr(WHITE, ctx, "card")).toBe("Color.markswift(1.0, 1.0, 1.0)");
    expect(colorExpr(WHITE, ctx, "other")).toBe(`Color.${border.name}`);
    // A call site that names the slot resolves each slot to its own token.
    expect(colorExpr(WHITE, ctx, "card", "fill0")).toBe(`Color.${card.name}`);
    expect(colorExpr(WHITE, ctx, "card", "border")).toBe(`Color.${border.name}`);
    expect(colorExpr(WHITE, ctx, "card", "outline")).toBe("Color.markswift(1.0, 1.0, 1.0)");
  });
});

describe("views referencing tokens", () => {
  /** The wave's point: one token-backed view serves both themes. */
  test("the two themes of one screen emit identical colour lines", () => {
    const [light, dark] = pair();
    const set = extractTokens([light!, dark!]);
    const body = (s: Screen, name: string) => {
      const view = emitSwift(s, name, { mode: "app", tokens: screenTokens(set, s) }).view;
      // The #Preview backdrop is a fixed page colour per theme, not a colour of the design.
      return view.slice(0, view.indexOf("#Preview")).split("\n").filter((l) => l.includes("Color."));
    };
    const lines = body(light!, "HomeView");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).toEqual(body(dark!, "HomeDarkView"));
    expect(lines.some((l) => l.includes("Color.markswift("))).toBe(false);
  });

  test("a colour outside the token set is still emitted as a literal", () => {
    const [light, dark] = pair();
    const lone = { kind: "solid" as const, color: rgb(0.2, 0.7, 0.3) };
    for (const s of [light!, dark!]) (s.root as StackNode).children.push(box({ id: "lone", style: style({ fills: [lone] }) }));
    const set = extractTokens([light!, dark!]);
    const view = emitSwift(light!, "HomeView", { mode: "app", tokens: screenTokens(set, light!) }).view;
    expect(view).toContain("Color.markswift(0.2, 0.7, 0.3)");
  });

  test("every token a view references is declared in MarkswiftTokens.swift", () => {
    const [light, dark] = pair();
    const set = extractTokens([light!, dark!]);
    const swift = emitDesignTokens(set);
    for (const s of [light!, dark!]) {
      const view = emitSwift(s, "V", { mode: "fidelity", tokens: screenTokens(set, s) }).view;
      const referenced = [...view.matchAll(/Color\.([a-z][A-Za-z0-9]*)/g)].map((m) => m[1]!).filter((n) => !n.startsWith("markswift") && n !== "clear");
      expect(referenced.length).toBeGreaterThan(0);
      for (const name of new Set(referenced)) expect(swift).toContain(`    static let ${name} = `);
    }
  });
});
