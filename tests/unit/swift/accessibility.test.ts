import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { EmitMode } from "../../../src/swift/context.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";

const FONT = {
  "font-family": "system-ui",
  "font-size": "17px",
  "font-weight": "400",
  "line-height": "22px",
  color: "rgb(24, 32, 42)",
};

function text(value: string, x: number, y: number, w: number, h: number): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x, y, w, h }, text: value, children: [] };
}

function swift(children: LayoutNode[], mode: EmitMode): string {
  const doc: LayoutDoc = {
    version: 2,
    source: "a11y.html",
    combo: { screen: "a11y", theme: "light" },
    size: { w: 320, h: 400 },
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 320, h: 400 },
      children,
    },
  };
  return emitSwift(inferScreen(doc, "A11y"), "A11yView", { mode }).view;
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("app-mode system fonts scale with Dynamic Type; fidelity and SVG text stay fixed", () => {
  const page = [
    {
      tag: "h2",
      id: "title",
      attrs: {},
      styles: { ...FONT, display: "block", "font-size": "24px", "font-weight": "700", "line-height": "32px" },
      bounds: { x: 0, y: 0, w: 320, h: 32 },
      children: [text("Settings", 0, 0, 100, 32)],
    },
    {
      tag: "p",
      id: "body",
      attrs: {},
      styles: { ...FONT, display: "block" },
      bounds: { x: 0, y: 40, w: 320, h: 22 },
      children: [text("Short body.", 0, 40, 90, 22)],
    },
  ];
  const app = swift(page, "app");
  expect(count(app, "@ScaledMetric(relativeTo: .title2) private var textSize24: CGFloat = 24.0")).toBe(1);
  expect(count(app, "@ScaledMetric(relativeTo: .body) private var textSize17: CGFloat = 17.0")).toBe(1);
  expect(app).toContain(".system(size: textSize24, weight: .bold, design: .default)");
  expect(app).toContain(".system(size: textSize17, weight: .regular, design: .default)");

  const fidelity = swift(page, "fidelity");
  expect(fidelity).toContain(".system(size: 24.0, weight: .bold, design: .default)");
  expect(fidelity).not.toContain("@ScaledMetric");

  const styles = { "font-family": "system-ui", "font-size": "12px", "font-weight": "400", fill: "rgb(0, 0, 0)" };
  const chart: LayoutNode = {
    tag: "svg",
    attrs: { viewbox: "0 0 100 50" },
    styles: { display: "block" },
    bounds: { x: 0, y: 0, w: 100, h: 50 },
    children: [
      {
        tag: "text",
        attrs: { x: "0", y: "12" },
        styles,
        bounds: { x: 0, y: 0, w: 24, h: 12 },
        children: [{ ...text("Jan", 0, 0, 24, 12), styles }],
      },
    ],
  };
  const svg = swift([chart], "app");
  expect(svg).toContain(".system(size: 12.0");
  expect(svg).not.toContain("@ScaledMetric");
});

const radius = (r: string) => ({
  "border-top-left-radius": r,
  "border-top-right-radius": r,
  "border-bottom-right-radius": r,
  "border-bottom-left-radius": r,
});
const padding = (v: number, h: number) => ({
  "padding-top": `${v}px`,
  "padding-right": `${h}px`,
  "padding-bottom": `${v}px`,
  "padding-left": `${h}px`,
});

test("a button's and a link's box is inside the label, so it is the hit and press area", () => {
  const button: LayoutNode = {
    tag: "button",
    id: "save",
    attrs: {},
    styles: {
      ...FONT,
      display: "inline-block",
      ...padding(8, 16),
      "background-color": "rgb(37, 99, 235)",
      ...radius("8px"),
    },
    bounds: { x: 0, y: 0, w: 70, h: 38 },
    children: [text("Save", 16, 8, 38, 22)],
  };
  const link: LayoutNode = {
    tag: "a",
    id: "open",
    attrs: { href: "https://example.com" },
    styles: { ...FONT, display: "block", ...padding(8, 8) },
    bounds: { x: 0, y: 50, w: 320, h: 38 },
    children: [text("Open", 8, 58, 40, 22)],
  };
  for (const mode of ["app", "fidelity"] as const) {
    const out = swift([button], mode);
    expect(out.indexOf(".background(")).toBeGreaterThan(-1);
    expect(out.indexOf(".background(")).toBeLessThan(out.indexOf(".buttonStyle(.plain)"));
    const shape = out.indexOf(".contentShape(RoundedRectangle(cornerRadius: 8.0, style: .circular))");
    expect(shape).toBeGreaterThan(-1);
    expect(shape).toBeLessThan(out.indexOf(".buttonStyle(.plain)"));

    const a = swift([link], mode);
    const dest = a.indexOf("Link(destination:");
    const pad = a.indexOf(".padding(8.0)");
    expect(dest).toBeGreaterThan(-1);
    expect(dest).toBeLessThan(pad);
    expect(pad).toBeLessThan(a.indexOf(".contentShape(Rectangle())"));
  }
});

function el(
  tag: string,
  attrs: Record<string, string>,
  bounds: LayoutNode["bounds"],
  children: LayoutNode[] = [],
  styles: Record<string, string> = {},
): LayoutNode {
  return { tag, id: attrs["id"] ?? tag, attrs, styles: { ...FONT, display: "block", ...styles }, bounds, children };
}

test("aria-label, aria-hidden, headings and roles reach VoiceOver", () => {
  const close = swift(
    [
      el("button", { "aria-label": "Close dialog" }, { x: 0, y: 0, w: 30, h: 30 }, [text("×", 10, 4, 10, 22)], {
        display: "inline-block",
      }),
    ],
    "app",
  );
  expect(close.indexOf('.accessibilityLabel("Close dialog")')).toBeGreaterThan(close.indexOf(".buttonStyle(.plain)"));

  const h2 = swift([el("h2", {}, { x: 0, y: 0, w: 320, h: 22 }, [text("Title", 0, 0, 40, 22)])], "app");
  expect(h2).toContain(".accessibilityAddTraits(.isHeader)");
  expect(h2).toContain(".accessibilityHeading(.h2)");

  const icon: LayoutNode = {
    tag: "svg",
    id: "icon",
    attrs: { viewbox: "0 0 10 10" },
    styles: { display: "inline-block" },
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    children: [],
  };
  const span = el("span", {}, { x: 14, y: 0, w: 40, h: 22 }, [text("Icons", 14, 0, 40, 22)], { display: "inline" });
  const group = swift(
    [
      el("div", { id: "group", role: "heading", "aria-level": "3" }, { x: 0, y: 0, w: 320, h: 22 }, [icon, span], {
        display: "flex",
      }),
    ],
    "app",
  );
  const combine = group.indexOf(".accessibilityElement(children: .combine)");
  expect(combine).toBeGreaterThan(-1);
  expect(combine).toBeLessThan(group.indexOf(".accessibilityHeading(.h3)"));

  const hidden = swift(
    [
      el("div", { "aria-hidden": "true" }, { x: 0, y: 0, w: 10, h: 10 }, [], {
        width: "10px",
        height: "10px",
        "background-color": "rgb(255, 0, 0)",
      }),
    ],
    "app",
  );
  expect(hidden).toContain(".accessibilityHidden(true)");

  const role = swift(
    [el("div", { role: "button", tabindex: "0" }, { x: 0, y: 0, w: 320, h: 22 }, [text("Confirm", 0, 0, 60, 22)])],
    "app",
  );
  expect(role).toContain(".accessibilityAddTraits(.isButton)");

  const img = swift(
    [
      el(
        "img",
        { alt: "Logo", "aria-label": "Company logo", src: "https://example.com/logo.png" },
        { x: 0, y: 0, w: 40, h: 40 },
        [],
        { display: "inline" },
      ),
    ],
    "app",
  );
  expect(img).toContain("Company logo");
  expect(img).not.toContain('.accessibilityLabel("Logo")');
});

/** The modifier lines of the view that starts on the first line containing `start`. */
function viewOf(swiftText: string, start: string): string {
  const lines = swiftText.split("\n");
  const i = lines.findIndex((l) => l.includes(start));
  const indent = lines[i]!.length - lines[i]!.trimStart().length;
  const out = [lines[i]!];
  for (const l of lines.slice(i + 1)) {
    const depth = l.length - l.trimStart().length;
    if (depth < indent || (depth === indent && !l.trimStart().startsWith(".") && !l.trimStart().startsWith("}"))) break;
    out.push(l);
  }
  return out.join("\n");
}

const checkbox = (id: string, attrs: Record<string, string>, y: number) =>
  el("input", { id, type: "checkbox", ...attrs }, { x: 0, y, w: 13, h: 13 }, [], { display: "inline-block" });

test("a <label> names its control, and tapping it toggles a checkbox", () => {
  const page = [
    el("label", { id: "emailLabel", for: "email" }, { x: 0, y: 0, w: 320, h: 22 }, [text("Email", 0, 0, 40, 22)]),
    el("input", { id: "email", type: "email", placeholder: "you@example.com" }, { x: 0, y: 30, w: 320, h: 30 }, [], {
      display: "inline-block",
    }),
    el("label", { id: "remember" }, { x: 0, y: 70, w: 320, h: 22 }, [
      checkbox("rememberBox", { checked: "" }, 74),
      text(" Remember me", 17, 70, 100, 22),
    ]),
    el("label", { id: "off" }, { x: 0, y: 100, w: 320, h: 22 }, [
      checkbox("offBox", { disabled: "" }, 104),
      text(" Disabled", 17, 100, 100, 22),
    ]),
    el("label", { id: "named", for: "work" }, { x: 0, y: 130, w: 320, h: 22 }, [text("Work", 0, 130, 40, 22)]),
    el("input", { id: "work", type: "text", "aria-label": "Work email" }, { x: 0, y: 160, w: 320, h: 30 }, [], {
      display: "inline-block",
    }),
  ];
  const app = swift(page, "app");
  expect(viewOf(app, 'TextField("you@example.com"')).toContain('.accessibilityLabel("Email")');
  const rep = app.indexOf(".accessibilityRepresentation {");
  expect(rep).toBeGreaterThan(-1);
  expect(app.slice(rep)).toContain('Toggle(isOn: $s_rememberBox) { Text(verbatim: "Remember me") }');
  expect(viewOf(app, "private var v_remember: some View")).toContain(".onTapGesture { s_rememberBox.toggle() }");
  expect(viewOf(app, "private var v_off: some View")).not.toContain(".onTapGesture");
  const work = viewOf(app, 'TextField("", text: $s_work)');
  expect(work).toContain('.accessibilityLabel("Work email")');
  expect(work).not.toContain('.accessibilityLabel("Work")');
});

test("radios sharing a name hold one selection", () => {
  const radio = (id: string, attrs: Record<string, string>, y: number) =>
    el("input", { id, type: "radio", ...attrs }, { x: 0, y, w: 13, h: 13 }, [], { display: "inline-block" });
  const dup = swift([radio("monthly", { name: "plan", checked: "" }, 0), radio("yearly", { name: "plan" }, 20)], "app");
  expect(count(dup, "@State private var s_plan")).toBe(1);
  expect(dup).toContain('@State private var s_plan: String = "0"');
  expect(dup).toContain('$s_plan.markswiftSelects("0")');
  expect(dup).toContain('$s_plan.markswiftSelects("1")');

  const valued = swift(
    [
      radio("monthly", { name: "plan", value: "monthly" }, 0),
      radio("yearly", { name: "plan", value: "yearly", checked: "" }, 20),
    ],
    "app",
  );
  expect(valued).toContain('@State private var s_plan: String = "yearly"');
  expect(valued).toContain('$s_plan.markswiftSelects("monthly")');
  expect(valued).toContain('$s_plan.markswiftSelects("yearly")');

  expect(swift([radio("lone", {}, 0)], "app")).toContain("@State private var s_lone: Bool = false");
});

test("input types choose the keyboard and content type in app mode", () => {
  const field = (type: string) => [
    el("input", { id: "f", type }, { x: 0, y: 0, w: 320, h: 30 }, [], { display: "inline-block" }),
  ];
  expect(swift(field("email"), "app")).toContain(".markswiftInputTraits(.email)");
  expect(swift(field("email"), "fidelity")).not.toContain(".markswiftInputTraits(");
  const password = swift(field("password"), "app");
  expect(password.indexOf("SecureField(")).toBeGreaterThan(-1);
  expect(password.indexOf("SecureField(")).toBeLessThan(password.indexOf(".markswiftInputTraits(.password)"));
});
