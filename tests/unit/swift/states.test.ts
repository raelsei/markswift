import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { walk, type ControlNode, type SemNode, type TextNode } from "../../../src/model/semantic.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const FONT = {
  "font-family": "system-ui",
  "font-size": "17px",
  "font-weight": "400",
  "line-height": "22px",
  color: "rgb(24, 32, 42)",
};
const BLUE = "rgb(37, 99, 235)";
const DARK_BLUE = "rgb(29, 78, 216)";
const BORDER = (c: string) =>
  Object.fromEntries(
    ["top", "right", "bottom", "left"].flatMap((e) => [
      [`border-${e}-width`, "1px"],
      [`border-${e}-style`, "solid"],
      [`border-${e}-color`, c],
    ]),
  );

let ids = 0;
function el(
  tag: string,
  attrs: Record<string, string>,
  children: LayoutNode[] = [],
  styles: Record<string, string> = {},
  states?: LayoutNode["states"],
): LayoutNode {
  return {
    tag,
    id: `n${++ids}`,
    attrs,
    styles: { ...FONT, display: "block", ...styles },
    bounds: { x: 0, y: 0, w: 120, h: 40 },
    children,
    ...(states ? { states } : {}),
  };
}

function text(value: string): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x: 10, y: 9, w: 40, h: 22 }, text: value, children: [] };
}

function doc(children: LayoutNode[]): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "states.html",
    combo: { screen: "states", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", {}, children),
  };
}

function compile(children: LayoutNode[], mode: "app" | "fidelity" = "app") {
  const result = compileLayout(doc(children), { mode });
  return { code: result.code, diagnostics: result.diagnostics.flatMap((d) => d.diagnostics) };
}

const button = (states: LayoutNode["states"], styles: Record<string, string> = { "background-color": BLUE }) =>
  el("button", {}, [text("Save")], styles, states);

test("analysis: pressed fill and caption colour land on the IR", () => {
  const screen = inferScreen(
    doc([button({ pressed: { "background-color": DARK_BLUE, color: "rgb(255, 255, 0)" } })]),
    "States",
  );
  const nodes: SemNode[] = [];
  walk(screen.root, (n) => nodes.push(n));
  const btn = nodes.find((n): n is ControlNode => n.kind === "control")!;
  expect(btn.states?.pressed?.fills?.[0]).toEqual({
    kind: "solid",
    color: { r: 29 / 255, g: 78 / 255, b: 216 / 255, a: 1 },
  });
  const caption = nodes.find((n): n is TextNode => n.kind === "text")!;
  expect(caption.states?.pressed?.runColors?.[0]).toEqual({ r: 1, g: 1, b: 0, a: 1 });
});

test("a pressed fill becomes a member, a press style and a colour ternary", () => {
  const { code } = compile([button({ pressed: { "background-color": DARK_BLUE } })]);
  expect(code).toContain("@MarkswiftPressed private var isSavePressed");
  expect(code).toContain(".buttonStyle(MarkswiftPressStyle(isPressed: $isSavePressed))");
  expect(code).toContain(
    "(isSavePressed ? Color.markswift(0.114, 0.306, 0.847) : Color.markswift(0.145, 0.388, 0.922))",
  );
});

test("a pressed caption colour is a run ternary", () => {
  const { code } = compile([button({ pressed: { color: "rgb(255, 255, 0)" } })]);
  expect(code).toContain(
    ".foregroundStyle((isSavePressed ? Color.markswift(1.0, 1.0, 0.0) : Color.markswift(0.094, 0.125, 0.165)))",
  );
});

test("a ghost button's pressed background fades in from transparent", () => {
  const { code } = compile([button({ pressed: { "background-color": "rgb(229, 231, 235)" } }, {})]);
  expect(code).toContain(
    "(isSavePressed ? Color.markswift(0.898, 0.906, 0.922) : Color.markswift(0.898, 0.906, 0.922, 0.0))",
  );
});

test("an :active scale is a scaleEffect ternary", () => {
  const { code } = compile([button({ pressed: { transform: "matrix(0.96, 0, 0, 0.96, 0, 0)" } })]);
  expect(code).toContain(".scaleEffect(x: isSavePressed ? 0.96 : 1.0, y: isSavePressed ? 0.96 : 1.0");
});

test("a focused field gets a focus member, .focused and border/ring ternaries", () => {
  const field = () =>
    el("input", { placeholder: "Email" }, [], BORDER("rgb(209, 213, 219)"), {
      focused: {
        ...Object.fromEntries(["top", "right", "bottom", "left"].map((e) => [`border-${e}-color`, BLUE])),
        "box-shadow": "rgba(37, 99, 235, 0.35) 0px 0px 0px 3px",
      },
    });
  const app = compile([field()]).code;
  expect(app).toContain("@MarkswiftFocused private var isEmailFocused");
  expect(app).toContain(".focused($isEmailFocused)");
  const fidelity = compile([field()], "fidelity").code;
  expect(fidelity).not.toContain(".focused(");
  for (const code of [app, fidelity]) {
    expect(code).toContain(
      "(isEmailFocused ? Color.markswift(0.145, 0.388, 0.922) : Color.markswift(0.82, 0.835, 0.859))",
    );
    expect(code).toContain(
      "(isEmailFocused ? Color.markswift(0.145, 0.388, 0.922, 0.35) : Color.markswift(0.145, 0.388, 0.922, 0.0))",
    );
  }
});

test("a delta outside any Button is reported, not drawn", () => {
  const { code, diagnostics } = compile([
    el("div", {}, [text("Card")], { "background-color": BLUE }, { pressed: { "background-color": DARK_BLUE } }),
  ]);
  expect(code).not.toContain("@MarkswiftPressed");
  expect(diagnostics.some((d) => d.feature === ":active")).toBe(true);
});

test("a gradient change is reported and the rest gradient stays", () => {
  const rest = "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))";
  const { code, diagnostics } = compile([
    button(
      { pressed: { "background-image": "linear-gradient(rgb(0, 255, 0), rgb(0, 0, 255))" } },
      { "background-image": rest },
    ),
  ]);
  expect(diagnostics.some((d) => d.feature === ":active" && d.message.includes("background-image"))).toBe(true);
  expect(code).toContain("Color.markswift(1.0, 0.0, 0.0)");
  expect(code).not.toContain("Color.markswift(0.0, 1.0, 0.0)");
});

test("a page without states emits no state members or ternaries", () => {
  for (const mode of ["app", "fidelity"] as const) {
    const { code } = compile([button(undefined), el("input", { placeholder: "Email" }, [], BORDER(BLUE))], mode);
    expect(code).not.toMatch(/Markswift(Pressed|Focused|PressStyle)/);
    expect(code).not.toMatch(/\? (Color\.markswift|Palette\.)/);
    expect(code).toContain(".buttonStyle(.plain)");
  }
});

test("an unstyled theme-painted button gets Chrome's pressed theme without any captured delta", () => {
  // Computed UA defaults of `<button>` in the light scheme (Chrome 155 / Chromium 153).
  const ua: Record<string, string> = { appearance: "auto", "background-color": "rgb(239, 239, 239)" };
  for (const e of ["top", "right", "bottom", "left"]) {
    ua[`border-${e}-style`] = "outset";
    ua[`border-${e}-width`] = "2px";
    ua[`border-${e}-color`] = "rgb(0, 0, 0)";
  }
  for (const c of ["top-left", "top-right", "bottom-right", "bottom-left"]) ua[`border-${c}-radius`] = "0px";
  const { code } = compile([button(undefined, { ...ua, "background-image": "none", "box-shadow": "none" })]);
  expect(code).toContain("@MarkswiftPressed private var isSavePressed");
  // Fill 239 → 245, edge 118 → 141 (measured under a real press at DPR 2).
  expect(code).toContain("isSavePressed ? Color.markswift(0.961, 0.961, 0.961) : Color.markswift(0.937, 0.937, 0.937)");
  expect(code).toContain("isSavePressed ? Color.markswift(0.553, 0.553, 0.553) : Color.markswift(0.463, 0.463, 0.463)");
});
