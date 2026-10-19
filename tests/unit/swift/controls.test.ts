/**
 * Form controls: the CSS look on native behaviour. Hand-built layout docs, so no browser is needed.
 */
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { EmitMode } from "../../../src/swift/context.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { ControlNode } from "../../../src/model/semantic.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const FONT = {
  "font-family": "system-ui",
  "font-size": "15px",
  "font-weight": "400",
  "line-height": "20px",
  color: "rgb(17, 24, 39)",
};
const SIDES = ["top", "right", "bottom", "left"];
const BOX = {
  "background-color": "rgb(255, 255, 255)",
  ...Object.fromEntries(
    SIDES.flatMap((s) => [
      [`border-${s}-style`, "solid"],
      [`border-${s}-width`, "1px"],
      [`border-${s}-color`, "rgb(255, 0, 0)"],
    ]),
  ),
};

function el(
  tag: string,
  attrs: Record<string, string>,
  bounds: LayoutNode["bounds"],
  children: LayoutNode[] = [],
  styles: Record<string, string> = {},
): LayoutNode {
  return { tag, id: attrs["id"] ?? tag, attrs, styles: { ...FONT, display: "block", ...styles }, bounds, children };
}
function text(value: string, x: number, y: number, w: number, h: number): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x, y, w, h }, text: value, children: [] };
}
function swift(children: LayoutNode[], mode: EmitMode = "app"): { view: string; diagnostics: string[] } {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "controls.html",
    combo: { screen: "controls", theme: "light" },
    size: { w: 320, h: 600 },
    viewport: { x: 0, y: 0, w: 320, h: 600 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: {
      tag: "main",
      id: "root",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 320, h: 600 },
      children,
    },
  };
  const screen = inferScreen(doc, "Controls");
  const diagnostics: string[] = [];
  const visit = (n: { diagnostics: { feature: string; message: string }[] } & Record<string, unknown>) => {
    for (const d of n.diagnostics) diagnostics.push(`${d.feature}: ${d.message}`);
    for (const c of [...((n["children"] as never[]) ?? []), ...((n["content"] as never[]) ?? [])]) visit(c);
  };
  visit(screen.root as never);
  // The controls' own Swift; repeated-sibling extraction has its own tests (components.test.ts).
  return { view: emitSwift(screen, "ControlsView", { mode, extract: false }).view, diagnostics };
}
const field = (tag: string, attrs: Record<string, string>, y: number, h = 38, children: LayoutNode[] = []) =>
  el(tag, attrs, { x: 0, y, w: 320, h }, children, { display: "inline-block", ...BOX });
const option = (label: string, attrs: Record<string, string> = {}) =>
  el("option", attrs, { x: 0, y: 0, w: 0, h: 0 }, [text(label, 0, 0, 0, 0)]);

test("text fields, select and textarea keep the CSS box and native behaviour", () => {
  const { view } = swift([
    field("input", { id: "name", type: "text", value: "Ada" }, 0),
    field("input", { id: "pw", type: "password" }, 40),
    field("select", { id: "country" }, 80, 38, [
      option("Canada"),
      option("Germany", { selected: "" }),
      option("Japan"),
    ]),
    field("textarea", { id: "bio" }, 120, 72, [text("Designer and developer.", 0, 0, 0, 0)]),
    field("textarea", { id: "note", placeholder: "Add a note" }, 200, 54),
  ]);
  expect(view.split(".textFieldStyle(.plain)").length - 1).toBe(2);
  expect(view).toContain("Menu {");
  expect(view).toContain(".pickerStyle(.inline)");
  expect(view).toContain("Text(verbatim: s_country)");
  expect(view).not.toContain("size: 0.0");
  expect(view).not.toContain('Text(verbatim: "Canada")');
  expect(view).toContain('@State private var s_bio: String = "Designer and developer."');
  expect(view.split(".markswiftTextEditorInsets()").length - 1).toBe(2);
  expect(view).toContain("if s_note.isEmpty {");
  expect(view).toContain('Text(verbatim: "Add a note")');
  // App mode: editors are as tall as their text (or prompt), the captured height a floor; fields keep the CSS line box.
  expect(view).toContain(".markswiftFitsText(s_bio)");
  expect(view).toContain('.markswiftFitsText(s_note.isEmpty ? "Add a note" : s_note)');
  expect(view).toContain("minHeight: 72.0");
  expect(view).not.toContain("height: 72.0,");
  expect(
    view.split(".markswiftFieldLineHeight(20.0, size: 15.0, relativeTo: .subheadline, capturedHeight: 36.0)").length -
      1,
  ).toBe(2);
  // An editor's text starts at its top, so its half-leading pads above the first line, as Chrome's line box.
  expect(
    view.split(".markswiftFieldLineHeight(20.0, size: 15.0, relativeTo: .subheadline, editor: true)").length - 1,
  ).toBe(2);
  const fidelity = swift(
    [field("textarea", { id: "bio" }, 0, 72, [text("Designer and developer.", 0, 0, 0, 0)])],
    "fidelity",
  );
  expect(fidelity.view).not.toContain("markswiftFitsText");
  expect(fidelity.view).not.toContain("markswiftFieldLineHeight");
});

test("an author ::placeholder colour paints the prompt; Chrome's UA grey keeps the platform grey byte-identical", () => {
  const ph = (color: string, extra: Record<string, string> = {}) => ({
    placeholder: {
      color,
      "-webkit-text-fill-color": color,
      opacity: "1",
      "font-style": "normal",
      "font-weight": "400",
      ...extra,
    },
  });
  const fields = (p?: LayoutNode["pseudoStyles"]): LayoutNode[] =>
    [
      field("input", { id: "q", type: "text", placeholder: "Search" }, 0),
      field("input", { id: "pw", type: "password", placeholder: "Password" }, 40),
      field("textarea", { id: "note", placeholder: "Add a note" }, 80, 54),
    ].map((n) => (p ? { ...n, pseudoStyles: p } : n));
  const red = "Color.markswift(0.784, 0.0, 0.0)";
  const app = swift(fields(ph("rgb(200, 0, 0)"))).view;
  expect(app).toContain(`TextField("Search", text: $s_q, prompt: Text(verbatim: "Search").foregroundStyle(${red}))`);
  expect(app).toContain(
    `SecureField("Password", text: $s_pw, prompt: Text(verbatim: "Password").foregroundStyle(${red}))`,
  );
  // Two prompts + the TextEditor overlay.
  expect(app.split(`.foregroundStyle(${red})`).length - 1).toBe(3);
  expect(app).not.toContain("markswiftPlaceholderText");
  const fidelity = swift(fields(ph("rgb(200, 0, 0)")), "fidelity").view;
  expect(fidelity.split(`.foregroundStyle(${red})`).length - 1).toBe(3);
  expect(fidelity).not.toContain("markswiftPlaceholderText");
  // Chrome's UA grey (the same in both themes) is no author colour: output equals a capture without pseudo styles.
  const ua = ph("rgb(117, 117, 117)");
  expect(swift(fields(ua)).view).toBe(swift(fields()).view);
  expect(swift(fields(ua), "fidelity").view).toBe(swift(fields(), "fidelity").view);
  // What Chrome paints: -webkit-text-fill-color over color; opacity fades it.
  const fill = {
    ...field("input", { id: "f", placeholder: "Fill" }, 0),
    pseudoStyles: ph("rgb(200, 0, 0)", { "-webkit-text-fill-color": "rgb(0, 128, 0)" }),
  };
  expect(swift([fill]).view).toContain(
    'prompt: Text(verbatim: "Fill").foregroundStyle(Color.markswift(0.0, 0.502, 0.0))',
  );
  const faded = {
    ...field("input", { id: "o", placeholder: "Faded" }, 0),
    pseudoStyles: ph("rgb(37, 99, 235)", { opacity: "0.5" }),
  };
  expect(swift([faded]).view).toContain(
    'prompt: Text(verbatim: "Faded").foregroundStyle(Color.markswift(0.145, 0.388, 0.922, 0.5))',
  );
});

test("app mode keeps a label and trailing icon spread across a button when the icon sits a pixel higher", () => {
  const button = el(
    "button",
    { id: "b" },
    { x: 0, y: 0, w: 320, h: 40 },
    [
      text("Billing", 0, 10, 100, 20),
      el("span", { id: "icon" }, { x: 304, y: 9, w: 16, h: 16 }, [], { "background-color": "rgb(0, 0, 0)" }),
    ],
    { display: "flex" },
  );
  const app = swift([button]).view;
  expect(app).toContain("Spacer(minLength: 0.0)");
  expect(app.indexOf('"Billing"')).toBeLessThan(app.indexOf("Spacer(minLength: 0.0)"));
  const fidelity = swift([button], "fidelity").view;
  expect(fidelity).not.toContain("Spacer(");
  expect(fidelity).toContain("VStack(alignment: .leading");
});

test("appearance: none removes the select arrow; native checkboxes and ranges drop the author's box paint", () => {
  expect(swift([field("select", { id: "s" }, 0, 38, [option("One")])]).view).toContain(
    'Image(systemName: "chevron.down")',
  );
  const none = swift([
    el("select", { id: "s" }, { x: 0, y: 0, w: 320, h: 38 }, [option("One")], { ...BOX, appearance: "none" }),
  ]);
  expect(none.view).not.toContain('Image(systemName: "chevron.down")');
  const native = swift([
    el("input", { id: "c", type: "checkbox" }, { x: 0, y: 0, w: 13, h: 13 }, [], {
      display: "inline-block",
      ...BOX,
      appearance: "auto",
    }),
    el("input", { id: "r", type: "range" }, { x: 0, y: 20, w: 200, h: 16 }, [], {
      display: "inline-block",
      ...BOX,
      appearance: "auto",
    }),
  ]).view;
  expect(native).not.toContain("strokeBorder(");
  // The #Preview has a `.background(` of its own; look for the box's white fill.
  expect(native).not.toContain(".background(Color.markswift(1.0, 1.0, 1.0)");
  const drawn = swift([
    el("input", { id: "c", type: "checkbox" }, { x: 0, y: 0, w: 13, h: 13 }, [], {
      display: "inline-block",
      ...BOX,
      appearance: "none",
    }),
  ]).view;
  expect(drawn).toContain("strokeBorder(");
  expect(drawn).toContain(".background(Color.markswift(1.0, 1.0, 1.0)");
});

test("a native select pads its label like Chrome's menulist and puts the arrow at the inner border edge", () => {
  // BOX: 1 px border; 12 px author padding → the 15 px arrow box overhangs the content edge by 12 px.
  const select = (styles: Record<string, string>) =>
    el("select", { id: "s" }, { x: 0, y: 0, w: 320, h: 38 }, [option("One")], {
      display: "inline-block",
      ...BOX,
      "padding-left": "12px",
      "padding-right": "12px",
      ...styles,
    });
  for (const mode of ["app", "fidelity"] as const) {
    const ua = swift([select({})], mode).view;
    expect(ua).toContain(".padding(EdgeInsets(top: 0.0, leading: 4.0, bottom: 0.0, trailing: 16.0))");
    expect(ua).toContain(".overlay(alignment: .trailing) {");
    expect(ua).toContain(".frame(width: 15.0)");
    expect(ua).toContain(".padding(.trailing, -12.0)");
    const none = swift([select({ appearance: "none" })], mode).view;
    expect(none).not.toContain("leading: 4.0, bottom: 0.0, trailing: 16.0");
    expect(none).not.toContain(".frame(width: 15.0)");
  }
});

test("an input button's caption stays one line and shrinks into its measured width", () => {
  const submit = el("input", { id: "go", type: "submit" }, { x: 0, y: 0, w: 58, h: 21 }, [], {
    display: "inline-block",
    ...BOX,
  });
  for (const mode of ["app", "fidelity"] as const) {
    const view = swift([submit], mode).view;
    expect(view).toContain('Text(verbatim: "Submit")\n');
    expect(view).toMatch(/Text\(verbatim: "Submit"\)\n\s*\.lineLimit\(1\)\n\s*\.minimumScaleFactor\(0\.8\)/);
  }
});

test("tapping a text field's <label> focuses it (app mode)", () => {
  const children = [
    el("label", { for: "email" }, { x: 0, y: 0, w: 320, h: 20 }, [text("Email", 0, 0, 40, 20)]),
    field("input", { id: "email", type: "email" }, 24),
    el("label", { for: "bio" }, { x: 0, y: 70, w: 320, h: 20 }, [text("Bio", 0, 70, 30, 20)]),
    field("textarea", { id: "bio" }, 94, 72),
    el("label", { for: "off" }, { x: 0, y: 170, w: 320, h: 20 }, [text("Off", 0, 170, 30, 20)]),
    field("input", { id: "off", type: "text", disabled: "" }, 194),
  ];
  const app = swift(children).view;
  expect(app).toContain("@MarkswiftFocused private var isEmailFocused");
  expect(app).toContain(".focused($isEmailFocused)");
  expect(app).toContain(".onTapGesture { isEmailFocused = true }");
  expect(app).toContain(".onTapGesture { isBioFocused = true }");
  expect(app.match(/@MarkswiftFocused/g)).toHaveLength(2);
  // Fidelity paints the fields' text: nothing takes focus.
  const fidelity = swift(children, "fidelity").view;
  expect(fidelity).not.toContain("MarkswiftFocused private");
  expect(fidelity).not.toContain(".onTapGesture");
});

test("accent-color tints checkboxes, ranges and progress bars", () => {
  const accent = { display: "inline-block", "accent-color": "rgb(225, 29, 72)" };
  const { view } = swift([
    el("input", { id: "c", type: "checkbox", checked: "" }, { x: 0, y: 0, w: 13, h: 13 }, [], accent),
    el("input", { id: "r", type: "range", value: "30" }, { x: 0, y: 20, w: 200, h: 16 }, [], accent),
    el("progress", { id: "p", value: "40", max: "100" }, { x: 0, y: 40, w: 150, h: 15 }, [], accent),
  ]);
  expect(view).not.toContain("tint: Color.markswift(0.0, 0.459, 1.0)");
  expect(view).toContain(".tint(");
  expect(view.split("Color.markswift(0.882, 0.114, 0.282)").length - 1).toBe(3);
});

test("input buttons paint their caption; Chrome's defaults fill a missing value", () => {
  const button = (type: string, value: string | undefined, y: number) =>
    el("input", { id: `${type}${y}`, type, ...(value !== undefined ? { value } : {}) }, { x: 0, y, w: 80, h: 21 }, [], {
      display: "inline-block",
      ...BOX,
    });
  const { view } = swift([
    button("submit", "Send", 0),
    button("submit", undefined, 30),
    button("reset", undefined, 60),
    button("button", "Go", 90),
  ]);
  for (const caption of ["Send", "Submit", "Reset", "Go"]) expect(view).toContain(`Text(verbatim: "${caption}")`);
  expect(view).not.toContain("Color.clear");
});

test("date inputs show their components and start at their value, deterministically", () => {
  const date = (type: string, value: string | undefined, y: number) =>
    el("input", { id: type.replace("-", ""), type, ...(value ? { value } : {}) }, { x: 0, y, w: 200, h: 24 }, [], {
      display: "inline-block",
    });
  const page = [
    date("time", "10:30", 0),
    date("datetime-local", "2026-10-10T09:15", 30),
    date("date", "2026-10-10", 60),
    date("week", "2026-W41", 90),
    date("month", "2026-10", 120),
  ];
  const first = swift(page);
  expect(first.view).toBe(swift(page).view);
  expect(first.view).toContain("displayedComponents: .hourAndMinute");
  expect(first.view).toContain("displayedComponents: [.date, .hourAndMinute]");
  expect(first.view).toContain("Date = .markswift(year: 2000, month: 1, day: 1, hour: 10, minute: 30, second: 0)");
  expect(first.view).toContain("Date = .markswift(year: 2026, month: 10, day: 10, hour: 9, minute: 15, second: 0)");
  expect(first.view).toContain("Date = .markswift(year: 2026, month: 10, day: 5, hour: 0, minute: 0, second: 0)");
  expect(first.view).toContain("Date = .markswift(year: 2026, month: 10, day: 1, hour: 0, minute: 0, second: 0)");
  expect(first.view).not.toContain("= .now");
  expect(first.diagnostics.filter((d) => d.startsWith("input: date:"))).toHaveLength(2);
  expect(swift([date("date", undefined, 0)]).view).toContain("Date = .now");
  expect(swift([date("date", "2026-02-30", 0)]).view).toContain("Date = .now");
});

test("details draw the captured summary and marker, no system chevron, no pinned height", () => {
  const marker: LayoutNode = {
    tag: "::marker",
    attrs: {},
    styles: { ...FONT, "font-variant-numeric": "tabular-nums" },
    bounds: { x: 13, y: 10, w: 10, h: 18 },
    children: [text("▸ ", 13, 10, 10, 18)],
  };
  const details = el(
    "details",
    { id: "d" },
    { x: 0, y: 0, w: 320, h: 38 },
    [
      el("summary", {}, { x: 13, y: 9, w: 294, h: 20 }, [marker, text("Returns", 29, 10, 56, 18)], {
        display: "list-item",
      }),
      el("p", {}, { x: 13, y: 37, w: 294, h: 20 }, [text("Free returns within 30 days.", 13, 38, 190, 18)]),
    ],
    { ...BOX, "padding-top": "8px", "padding-bottom": "8px", "padding-left": "12px", "padding-right": "12px" },
  );
  const { view } = swift([details]);
  expect(view).toContain(".disclosureGroupStyle(MarkswiftDisclosureStyle(spacing: 8.0))");
  expect(view).toContain('Text(verbatim: s_d ? "▾ " : "▸ ")');
  const group = view.slice(view.indexOf("DisclosureGroup("));
  expect(group.slice(0, group.indexOf(".disclosureGroupStyle(") + 200)).not.toContain(".frame(height:");
});

test("disabled-field-dim — a disabled text field or editor keeps the design's opacity in app mode", () => {
  // SwiftUI dims a disabled Button itself, but not a TextField/TextEditor whose text has its own colour.
  const dim = { display: "inline-block", ...BOX, opacity: "0.5" };
  const { view } = swift([
    el("input", { type: "text", value: "Read only", disabled: "" }, { x: 0, y: 0, w: 320, h: 38 }, [], dim),
    el("textarea", { disabled: "" }, { x: 0, y: 50, w: 320, h: 64 }, [text("Locked", 10, 58, 50, 20)], dim),
  ]);
  expect(view.match(/\.disabled\(true\)/g)).toHaveLength(2);
  expect(view.match(/\.opacity\(0\.5\)/g)).toHaveLength(2);
});

test("field-face-leading — an editor in a bundled face spaces its lines from that face's natural line", () => {
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "controls.html",
    combo: { screen: "controls", theme: "light" },
    size: { w: 320, h: 100 },
    viewport: { x: 0, y: 0, w: 320, h: 100 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", {}, { x: 0, y: 0, w: 320, h: 100 }, [
      field("textarea", { id: "note" }, 0, 66, [text("Sidebar navigation landed.", 0, 0, 0, 0)]),
    ]),
  };
  const screen = inferScreen(doc, "Controls");
  const editor = (screen.root.kind === "stack" ? screen.root.children[0] : screen.root) as ControlNode;
  editor.font = { ...editor.font!, family: { kind: "custom", name: "Geist Variable" }, size: 16, lineHeight: 24 };
  const metrics = { "geist variable": { upem: 1000, ascent: 1005, descent: 295, lineGap: 0, useTypoMetrics: false } };
  const view = emitSwift(screen, "ControlsView", { mode: "app", fontMetrics: metrics }).view;
  // The face name lets the runtime find how far the editor's tall glyphs lower its first line.
  expect(view).toContain(
    '.markswiftFieldLineHeight(24.0, size: 16.0, relativeTo: .callout, natural: 1.3, editor: true, face: "Geist Variable")',
  );
});

test("control-content-place — a switch thumb stays at the track's start in its fixed frame", () => {
  // Radix switch: a 32×18.4 track (1 px border) with a 16 px thumb at the start; a fixed frame centres by default.
  const track = el(
    "button",
    { role: "switch", "aria-checked": "false", id: "sw" },
    { x: 0, y: 0, w: 32, h: 18.4 },
    [
      el("span", { id: "thumb" }, { x: 1, y: 1.2, w: 16, h: 16 }, [], {
        display: "block",
        "background-color": "rgb(255, 255, 255)",
      }),
    ],
    { display: "inline-flex", "align-items": "center", ...BOX },
  );
  const { view } = swift([track]);
  expect(view).toContain(".frame(width: 32.0, alignment: .leading)");
});

test("editor-edge-effect — an app-mode editor draws no scroll edge effect over its first line", () => {
  // iOS 26 softens the top edge of a scroll view whose content reaches it; a `<textarea>` paints no such fade.
  const { view } = swift([field("textarea", { id: "note" }, 0, 66, [text("Sidebar navigation landed.", 0, 0, 0, 0)])]);
  expect(view).toMatch(/\.scrollContentBackground\(\.hidden\)\n\s*\.markswiftScrollEdgeEffectHidden\(\)\n/);
});

test("field-text-centre — a select's or field's single line stays centred in its app-mode height floor", () => {
  // Chrome centres a select's and an input's text in the box; an editor's text starts at the top.
  const { view } = swift([
    field("select", { id: "region" }, 0, 32, [option("Frankfurt", { selected: "" })]),
    field("input", { id: "name", type: "text", value: "Ada" }, 40, 32),
    field("textarea", { id: "bio" }, 80, 64, [text("Designer.", 0, 0, 0, 0)]),
  ]);
  expect(view.match(/minHeight: 32\.0, alignment: \.leading\)/g)).toHaveLength(2);
  expect(view).toContain("minHeight: 64.0, alignment: .topLeading)");
});

test("a disabled fieldset disables its controls, except inside its first legend", () => {
  const box = (y: number, h: number) => ({ x: 0, y, w: 320, h });
  const { view } = swift([
    el("fieldset", { id: "fs", disabled: "" }, box(0, 200), [
      el("legend", { id: "first" }, box(0, 40), [field("input", { id: "exempt", type: "text" }, 0)]),
      field("input", { id: "inside", type: "text" }, 50),
      el("legend", { id: "second" }, box(100, 40), [field("input", { id: "later", type: "text" }, 100)]),
      el("fieldset", { id: "inner" }, box(150, 50), [
        el("legend", { id: "innerLegend" }, box(150, 40), [field("input", { id: "nested", type: "text" }, 150)]),
      ]),
    ]),
    field("input", { id: "outside", type: "text" }, 210),
  ]);
  const disabledAfter = (state: string) => {
    const at = view.indexOf(`text: $${state})`);
    const next = view.indexOf("TextField(", at + 1);
    return view.slice(at, next < 0 ? undefined : next).includes(".disabled(true)");
  };
  expect(disabledAfter("s_exempt")).toBe(false);
  expect(disabledAfter("s_inside")).toBe(true);
  expect(disabledAfter("s_later")).toBe(true);
  // An inner fieldset's legend is exempt from that fieldset only, not from the outer one.
  expect(disabledAfter("s_nested")).toBe(true);
  expect(disabledAfter("s_outside")).toBe(false);
});

test("radios group by form owner and name; an unnamed radio only selects", () => {
  const radio = (id: string, attrs: Record<string, string>, y: number) =>
    el("input", { id, type: "radio", ...attrs }, { x: 0, y, w: 13, h: 13 }, [], { display: "inline-block" });
  const box = (y: number) => ({ x: 0, y, w: 320, h: 40 });
  const { view } = swift([
    el("form", { id: "a" }, box(0), [
      radio("a1", { name: "size", value: "s", checked: "" }, 0),
      radio("a2", { name: "size", value: "m" }, 20),
    ]),
    el("form", { id: "b" }, box(60), [
      radio("b1", { name: "size", value: "s" }, 60),
      radio("b2", { name: "size", value: "m", checked: "" }, 80),
    ]),
    // `form=` names its owner wherever the radio sits.
    radio("c1", { name: "size", value: "l", form: "b" }, 120),
    radio("solo", {}, 140),
  ]);
  expect(view.split("@State private var s_size").length - 1).toBe(2);
  expect(view).toContain('@State private var s_size: String = "s"');
  expect(view).toContain('@State private var s_size_r2: String = "m"');
  expect(view).toContain('$s_size.markswiftSelects("m")');
  expect(view).toContain('$s_size_r2.markswiftSelects("l")');
  // HTML: a radio without a name is its own group; a tap selects it and never clears it.
  expect(view).toContain("@State private var s_solo: Bool = false");
  expect(view).toContain("Toggle(isOn: $s_solo.markswiftSelects(true))");
});

test("a select lists only its visible options, disables the disabled ones and heads its groups", () => {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  const { view } = swift([
    field("select", { id: "pick" }, 0, 38, [
      option("Choose a size", { disabled: "", hidden: "", selected: "" }),
      option("S"),
      el("optgroup", { label: "Large" }, zero, [option("L"), option("XL", { disabled: "" })]),
      el("optgroup", { label: "Sold out", disabled: "" }, zero, [option("XXL")]),
    ]),
    field("select", { id: "first" }, 50, 38, [option("Gone", { disabled: "" }), option("Here")]),
  ]);
  // The placeholder shows while closed but is no choice in the menu.
  expect(view).toContain('@State private var s_pick: String = "Choose a size"');
  expect(view).not.toContain('["Choose a size"');
  expect(view).toContain('ForEach(["S"], id: \\.self)');
  expect(view).toContain('} header: {\n                        Text(verbatim: "Large")');
  expect(view).toContain('.disabled(["XL"].contains(option))');
  // A disabled group disables every option in it.
  expect(view).toMatch(/ForEach\(\["XXL"\], id: \\\.self\) \{ option in\n\s+Text\(option\)\n\s+\.disabled\(true\)/);
  expect(view).toContain('Text(verbatim: "Sold out")');
  // Nothing selected: the browser selects the first option that is not disabled.
  expect(view).toContain('@State private var s_first: String = "Here"');
});
