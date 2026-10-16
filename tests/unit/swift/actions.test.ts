import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const FONT = {
  "font-family": "system-ui",
  "font-size": "17px",
  "font-weight": "400",
  "line-height": "22px",
  color: "rgb(24, 32, 42)",
};

let ids = 0;
function el(
  tag: string,
  attrs: Record<string, string>,
  children: LayoutNode[] = [],
  styles: Record<string, string> = {},
  bounds: LayoutNode["bounds"] = { x: 0, y: 0, w: 120, h: 22 },
): LayoutNode {
  return { tag, id: `n${++ids}`, attrs, styles: { ...FONT, display: "block", ...styles }, bounds, children };
}

function text(value: string, w = 60): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w, h: 22 }, text: value, children: [] };
}

/** Every fixture's Swift, for the invariants at the end of the file. */
const outputs: string[] = [];

function compile(children: LayoutNode[], mode: "app" | "fidelity" = "app") {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "actions.html",
    combo: { screen: "actions", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", {}, children, {}, { x: 0, y: 0, w: 320, h: 400 }),
  };
  // Per-node members; repeated-sibling extraction (per-row actions) has its own tests (components.test.ts).
  const result = compileLayout(doc, { mode, extract: false });
  outputs.push(result.code);
  const diagnostics = result.diagnostics.flatMap((d) => d.diagnostics);
  return { code: result.code, diagnostics };
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("027: a plain button gets a named placeholder action", () => {
  const { code } = compile([el("button", {}, [text("Save")])]);
  expect(code).toContain("Button(action: onSave)");
  expect(code).toContain("var onSave: () -> Void = {}");
  expect(code).toContain("in the design has no handler");
});

test("027: the handler name beats the caption", () => {
  const { code } = compile([el("button", { onclick: "save()" }, [text("Store")])]);
  expect(code).toContain("Button(action: onSave)");
  expect(code).toContain('/// `onclick="save()"` in the design.');
});

test("027: alike names are deduplicated, a shared handler is one member", () => {
  const twin = compile([el("button", {}, [text("Edit")]), el("button", {}, [text("Edit")])]).code;
  expect(twin).toContain("Button(action: onEdit)");
  expect(twin).toContain("Button(action: onEdit2)");
  const shared = compile([
    el("button", { onclick: "go()" }, [text("A")]),
    el("button", { onclick: "go()" }, [text("B")]),
  ]).code;
  expect(count(shared, "var onGo:")).toBe(1);
  expect(count(shared, "Button(action: onGo)")).toBe(2);
});

test("027: a role=button div is a real Button", () => {
  const { code } = compile([el("div", { role: "button", onclick: "openMenu()" }, [text("Menu")])]);
  expect(code).toContain("Button(action: onOpenMenu)");
  expect(code).toContain(".buttonStyle(.plain)");
  expect(code).not.toContain(".isButton");
});

test("027: an activatable element containing a control gets a tap gesture", () => {
  const { code } = compile([
    el("div", { role: "button" }, [el("input", { type: "checkbox" }, [], {}, { x: 0, y: 0, w: 13, h: 13 })]),
  ]);
  expect(code).not.toContain("Button(action: on");
  expect(code).toContain(".onTapGesture { on");
  expect(code).toContain(".accessibilityAddTraits(.isButton)");
});

test("027: input buttons are named from their caption", () => {
  expect(compile([el("input", { type: "submit", value: "Send" })]).code).toContain("Button(action: onSend)");
  expect(compile([el("input", { type: "reset" })]).code).toContain("Button(action: onReset)");
  expect(compile([el("input", { type: "button" })]).code).toContain("Button(action: onAction)");
});

test("027: form onsubmit reaches the fields' Return and the submit button", () => {
  const { code } = compile([
    el("form", { onsubmit: "save(event)" }, [el("input", { type: "text" }), el("button", {}, [text("Go")])]),
  ]);
  expect(code).toContain(".onSubmit { onSave() }");
  expect(code).toContain("Button(action: onSave)");
  expect(count(code, "var onSave:")).toBe(1);
});

test("027: a block in-app link is a Button over its target", () => {
  const { code } = compile([el("a", { href: "#faq" }, [text("FAQ")])]);
  expect(code).toContain("Button(action: onFaq)");
});

test("027: inline links are link runs; in-app hrefs route to members", () => {
  const { code, diagnostics } = compile([
    el("p", {}, [
      text("Read the "),
      el("a", { href: "https://e.com" }, [text("docs")], { display: "inline" }),
      text(" or "),
      el("a", { href: "#faq" }, [text("FAQ")], { display: "inline" }),
    ]),
  ]);
  expect(code).toContain('Text.markswiftLink("docs", "https://e.com",');
  expect(code).toContain('case "#faq": onFaq(); return .handled');
  expect(code).toContain("default: return .systemAction");
  // An inline link loses nothing: no `a` diagnostic (only a block in-app link reports its placeholder).
  expect(diagnostics.filter((d) => d.feature === "a")).toEqual([]);
});

test("027: an inline link with background-clip: text is reported as one colour", () => {
  const { diagnostics } = compile([
    el("p", {}, [
      text("Go "),
      el("a", { href: "https://e.com" }, [text("there")], {
        display: "inline",
        "background-clip": "text",
        "background-image": "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))",
        color: "rgba(0, 0, 0, 0)",
        "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
      }),
    ]),
  ]);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ feature: "background-clip: text", message: expect.stringContaining("link") }),
  );
});

test("027: an inline non-link handler is reported", () => {
  const { diagnostics } = compile([
    el("p", {}, [text("Hi "), el("span", { onclick: "x()" }, [text("there")], { display: "inline" })]),
  ]);
  expect(diagnostics).toContainEqual(expect.objectContaining({ feature: "@onclick" }));
});

test("052: a pointer-events: none overlay ends with .allowsHitTesting(false) in app mode only", () => {
  const veil = () =>
    el("div", {}, [], { position: "absolute", "pointer-events": "none", "background-color": "rgb(0, 0, 255)" });
  const app = compile([el("p", {}, [text("Under")]), veil()]).code;
  expect(count(app, ".allowsHitTesting(false)")).toBe(1);
  // Last on the node's own view; only the overlay's placement `.offset` follows, outside it.
  expect(app).toMatch(/\.allowsHitTesting\(false\)\n(\s*\.offset\([^\n]*\n)?\s*\}/);
  expect(compile([el("p", {}, [text("Under")]), veil()], "fidelity").code).not.toContain(".allowsHitTesting");
});

test("052: a pass-through overlay button gets .allowsHitTesting(false) after its placement", () => {
  const { code } = compile([
    el("p", {}, [text("Under")]),
    el("button", { onclick: "go()" }, [text("Go")], { position: "absolute", "pointer-events": "none" }),
  ]);
  expect(count(code, ".allowsHitTesting(false)")).toBe(1);
  expect(code.indexOf(".allowsHitTesting(false)")).toBeGreaterThan(code.indexOf(".buttonStyle("));
  expect(code).toMatch(/\.allowsHitTesting\(false\)\n(\s*\.offset\([^\n]*\n)?\s*\}/);
});

test("027: no dead Buttons, no snake-case members, every action declared", () => {
  const out = outputs.join("\n");
  expect(out).not.toContain("Button(action: {})");
  expect(out).not.toMatch(/\bon_[A-Za-z]/);
  for (const m of out.matchAll(/Button\(action: (\w+)\)/g)) expect(out).toContain(`var ${m[1]}: () -> Void = {}`);
});
