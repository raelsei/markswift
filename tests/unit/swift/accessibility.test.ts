import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
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
    version: LAYOUT_DOC_VERSION,
    source: "a11y.html",
    combo: { screen: "a11y", theme: "light" },
    size: { w: 320, h: 400 },
    viewport: { x: 0, y: 0, w: 320, h: 400 },
    conditions: [],
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
  // The nodes' own Swift; repeated-sibling extraction has its own tests (components.test.ts).
  return emitSwift(inferScreen(doc, "A11y"), "A11yView", { mode, extract: false }).view;
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

test("app-mode captions scale with .caption, never .caption2; letter-spacing scales with the size; fidelity keeps px", () => {
  const caption: LayoutNode = {
    tag: "p",
    id: "cap",
    attrs: {},
    styles: { ...FONT, display: "block", "font-size": "10px", "line-height": "14px", "letter-spacing": "0.5px" },
    bounds: { x: 0, y: 0, w: 320, h: 14 },
    children: [text("VARIANTS", 0, 0, 60, 14)],
  };
  const app = swift([caption], "app");
  // The accessibility audit reports any `.caption2`-relative font (even `.font(.caption2)`) as partially unsupported.
  expect(app).toContain("@ScaledMetric(relativeTo: .caption) private var textSize10: CGFloat = 10.0");
  expect(app).not.toContain(".caption2");
  expect(app).toContain(".kerning(textSize10 * 0.5 / 10.0)");
  expect(swift([caption], "fidelity")).toContain(".kerning(0.5)");
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
  expect(role).toContain("Button(action: onConfirm)");
  expect(role).not.toContain(".accessibilityAddTraits(.isButton)");

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
  // No Text in the representation: a label Text in the mark's small frame is clipped text to the audit and grows the frame.
  expect(app.slice(rep)).toContain(
    'Toggle(isOn: $s_rememberBox) { EmptyView() }.accessibilityLabel(Text(verbatim: "Remember me"))',
  );
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

const field = (attrs: Record<string, string>, y = 0) =>
  el("input", { id: "f", ...attrs }, { x: 0, y, w: 320, h: 30 }, [], { display: "inline-block" });
const inline = { display: "inline" };

test("aria-labelledby names a field and wins over aria-label", () => {
  const app = swift(
    [
      el("span", { id: "t1" }, { x: 0, y: 0, w: 60, h: 22 }, [text("Billing", 0, 0, 60, 22)], inline),
      el("span", { id: "t2" }, { x: 64, y: 0, w: 60, h: 22 }, [text("address", 64, 0, 60, 22)], inline),
      field({ "aria-labelledby": "t1 t2", "aria-label": "X" }, 30),
    ],
    "app",
  );
  const view = viewOf(app, "TextField(");
  expect(view).toContain('.accessibilityLabel("Billing address")');
  expect(view).not.toContain('.accessibilityLabel("X")');
});

test("aria-describedby and aria-description become the hint", () => {
  const app = swift(
    [
      el("p", { id: "h" }, { x: 0, y: 0, w: 320, h: 22 }, [text("We never share it", 0, 0, 140, 22)]),
      field({ "aria-describedby": "h" }, 30),
      el("div", { id: "sheet", "aria-description": "Opens in a sheet" }, { x: 0, y: 70, w: 320, h: 22 }, [
        text("Details", 0, 70, 60, 22),
      ]),
    ],
    "app",
  );
  expect(viewOf(app, "TextField(")).toContain('.accessibilityHint("We never share it")');
  expect(app).toContain('.accessibilityHint("Opens in a sheet")');
});

test("aria-valuenow and aria-valuetext become the value", () => {
  const bar = (attrs: Record<string, string>) =>
    swift([el("div", { id: "bar", role: "progressbar", ...attrs }, { x: 0, y: 0, w: 320, h: 8 })], "app");
  expect(bar({ "aria-valuenow": "40" })).toContain('.accessibilityValue("40")');
  const valued = bar({ "aria-valuenow": "40", "aria-valuetext": "40 percent" });
  expect(valued).toContain('.accessibilityValue("40 percent")');
  expect(valued).not.toContain('.accessibilityValue("40")');
});

test("selected tabs, current links and checked checkboxes add .isSelected", () => {
  const tab = swift(
    [
      el("button", { id: "tab", role: "tab", "aria-selected": "true" }, { x: 0, y: 0, w: 60, h: 30 }, [
        text("Plans", 8, 4, 40, 22),
      ]),
    ],
    "app",
  );
  expect(tab).toContain(".accessibilityAddTraits(.isSelected)");
  const current = swift(
    [
      el("a", { id: "here", href: "/x", "aria-current": "page" }, { x: 0, y: 0, w: 60, h: 22 }, [
        text("Home", 0, 0, 40, 22),
      ]),
    ],
    "app",
  );
  expect(current).toContain(".accessibilityAddTraits(.isSelected)");
  const box = swift(
    [
      el("div", { id: "box", role: "checkbox", "aria-checked": "true" }, { x: 0, y: 0, w: 320, h: 22 }, [
        text("Agree", 0, 0, 40, 22),
      ]),
    ],
    "app",
  );
  expect(box).toContain(".accessibilityAddTraits(.isToggle)");
  expect(box).toContain(".accessibilityAddTraits(s_box ? .isSelected : [])");
});

test("a text-only tabpanel's name labels a group around the Text, which keeps its words", () => {
  const app = swift(
    [
      el("button", { id: "t", role: "tab" }, { x: 0, y: 0, w: 60, h: 30 }, [text("All", 8, 4, 40, 22)]),
      el("div", { id: "panel", role: "tabpanel", "aria-labelledby": "t" }, { x: 0, y: 40, w: 320, h: 22 }, [
        text("Body copy", 0, 40, 80, 22),
      ]),
    ],
    "app",
  );
  const body = viewOf(app, 'Text(verbatim: "Body copy")');
  expect(body.indexOf(".accessibilityElement(children: .contain)")).toBeGreaterThan(-1);
  expect(body.indexOf(".accessibilityElement(children: .contain)")).toBeLessThan(
    body.indexOf('.accessibilityLabel("All")'),
  );
});

test("ARIA toggle Buttons own their checked state: a tap flips it, then runs the action", () => {
  const toggle = (id: string, attrs: Record<string, string>, y: number) =>
    el("button", { id, type: "button", ...attrs }, { x: 0, y, w: 16, h: 16 }, [], { display: "inline-block" });
  const label = (id: string, target: string, y: number) =>
    el("label", { id, for: target }, { x: 30, y, w: 200, h: 22 }, [text(id, 30, y, 60, 22)]);
  const app = swift(
    [
      toggle("on", { role: "checkbox", "aria-checked": "true" }, 0),
      label("On", "on", 0),
      toggle("mix", { role: "checkbox", "aria-checked": "mixed" }, 30),
      toggle("sw", { role: "switch", "aria-checked": "false" }, 60),
      toggle("off", { role: "switch", "aria-checked": "false", disabled: "" }, 90),
      label("Off", "off", 90),
    ],
    "app",
  );
  expect(app).toContain("@State private var s_on: Bool = true");
  expect(app).toContain("Button {\n                s_on.toggle()\n                onOn()\n            } label: {");
  expect(app).toContain(".accessibilityAddTraits(s_on ? .isSelected : [])");
  expect(app).not.toContain(".accessibilityAddTraits(.isSelected)");
  // HTML: a tap on the `<label for>` clicks the button.
  expect(app).toContain(".onTapGesture { s_on.toggle(); onOn() }");
  // `mixed` is the third state: `nil` until the first tap checks it. The explicit value replaces the
  // "1"/"0" iOS derives from `.isSelected` on a toggle, so it spells them out.
  expect(app).toContain("@State private var s_mix: Bool? = nil");
  expect(app).toContain("s_mix = !(s_mix ?? false)");
  expect(app).toContain('.accessibilityValue(s_mix == nil ? "mixed" : s_mix == true ? "1" : "0")');
  expect(app).toContain(".accessibilityAddTraits(s_mix == true ? .isSelected : [])");
  expect(app).toContain("@State private var s_sw: Bool = false");
  expect(app).not.toContain(".onTapGesture { s_off");

  // Radios of one radiogroup share a selection, tagged by position; the last checked one is selected.
  const group = swift(
    [
      el("div", { id: "plan", role: "radiogroup" }, { x: 0, y: 0, w: 320, h: 40 }, [
        toggle("m", { role: "radio", "aria-checked": "false" }, 0),
        toggle("y", { role: "radio", "aria-checked": "true" }, 20),
      ]),
    ],
    "app",
  );
  expect(count(group, "@State private var s_plan: String")).toBe(1);
  expect(group).toContain('@State private var s_plan: String = "1"');
  expect(group).toContain('s_plan = "0"\n');
  expect(group).toContain('.accessibilityAddTraits(s_plan == "1" ? .isSelected : [])');
});

test("aria-disabled disables a button in app mode only", () => {
  const pay = (mode: EmitMode) =>
    swift(
      [
        el(
          "button",
          { id: "pay", "aria-disabled": "true" },
          { x: 0, y: 0, w: 60, h: 30 },
          [text("Pay", 8, 4, 30, 22)],
          {
            display: "inline-block",
          },
        ),
      ],
      mode,
    );
  expect(pay("app")).toContain(".disabled(true)");
  expect(pay("fidelity")).not.toContain(".disabled(");
});

test("aria-disabled disables an activatable div's Button", () => {
  const app = swift(
    [
      el(
        "div",
        { id: "pay", role: "button", onclick: "pay()", "aria-disabled": "true" },
        { x: 0, y: 0, w: 320, h: 22 },
        [text("Pay", 0, 0, 30, 22)],
      ),
    ],
    "app",
  );
  const lines = app.split("\n").map((l) => l.trim());
  const style = lines.indexOf(".buttonStyle(.plain)");
  expect(style).toBeGreaterThan(-1);
  expect(lines[style + 1]).toBe(".disabled(true)");
});

test("aria-expanded becomes the value", () => {
  const app = swift(
    [
      el(
        "button",
        { id: "more", "aria-expanded": "false" },
        { x: 0, y: 0, w: 60, h: 30 },
        [text("More", 8, 4, 40, 22)],
        {
          display: "inline-block",
        },
      ),
    ],
    "app",
  );
  expect(app).toContain('.accessibilityValue("collapsed")');
});

test("autocomplete names the field's autofill type", () => {
  expect(swift([field({ autocomplete: "shipping given-name" })], "app")).toContain(
    '.markswiftInputTraits(autofill: "given-name")',
  );
  expect(swift([field({ type: "email", autocomplete: "email" })], "app")).toContain(
    '.markswiftInputTraits(.email, autofill: "email")',
  );
  expect(swift([field({ autocomplete: "off" })], "app")).not.toContain("autofill:");
});

test("inputmode chooses the keyboard; unknown keywords are ignored", () => {
  expect(swift([field({ inputmode: "numeric" })], "app")).toContain('.markswiftInputTraits(inputMode: "numeric")');
  expect(swift([field({ inputmode: "bogus" })], "app")).not.toContain("inputMode:");
});

test("enterkeyhint labels the Return key", () => {
  expect(swift([field({ enterkeyhint: "send" })], "app")).toContain('.markswiftInputTraits(enterKey: "send")');
});

test("link-like Buttons announce a link, not a button", () => {
  const span = swift(
    [
      el(
        "span",
        { id: "go", role: "link", onclick: "go()" },
        { x: 0, y: 0, w: 60, h: 22 },
        [text("Go", 0, 0, 20, 22)],
        {
          display: "inline-block",
        },
      ),
    ],
    "app",
  );
  expect(span).toContain(".accessibilityRemoveTraits(.isButton)");
  expect(span).toContain(".accessibilityAddTraits(.isLink)");
  const anchor = swift(
    [el("a", { id: "faq", href: "#faq" }, { x: 0, y: 0, w: 60, h: 22 }, [text("FAQ", 0, 0, 30, 22)])],
    "app",
  );
  expect(anchor).toContain(".accessibilityRemoveTraits(.isButton)");
  expect(anchor).toContain(".accessibilityAddTraits(.isLink)");
});
