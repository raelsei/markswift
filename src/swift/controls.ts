/**
 * `ControlNode` → SwiftUI. The node's box (fill, border, radius, padding, frame) is painted by
 * the shared modifier chain in `modifiers.ts`; this file emits only the interactive core that goes
 * inside it, plus the view members that core needs: one `@State` per stateful control and one
 * callback property per distinct `onclick` handler.
 *
 * Mode difference — live controls. `app` emits the real thing (`TextField`, `Slider`, `Picker`,
 * …) in the CSS look: text fields are `.plain` (the CSS box is their chrome), `<select>` is a
 * `Menu` labelled by its selection over an inline `Picker`. `ImageRenderer`, which the verifier
 * draws with, cannot rasterise UIKit-backed controls and paints a yellow placeholder instead, so
 * `fidelity` emits what the browser painted: the field's text, the slider's track, the picker's
 * selection. Everything that is pure SwiftUI (`Button`, `Toggle` with a drawn style,
 * `ProgressView`/`Gauge` with a drawn style, `DisclosureGroup` with `MarkswiftDisclosureStyle`)
 * is identical in both modes.
 */
import type { Theme } from "../model/layout.ts";
import type { FontMetrics } from "../model/fonts.ts";
import type { ControlNode, MenuItem, MenuSpec, PickerOption, SemNode } from "../model/semantic.ts";
import type { ColorCtx, ControlMembers, EmitMode, ScreenTokens } from "./context.ts";
import { numericValue } from "./control-state.ts";
import { colorArgs, colorExpr, fontExpr, indent, nearestTextStyle, num, str } from "./format.ts";
import { shapeExpr } from "./paint.ts";
import { animationExpr } from "./motion.ts";

/** What the emitter must be able to do with a control's children and label. */
export interface ControlDeps extends ColorCtx {
  /** Emits a child node the way the surrounding view would (containers → their property). */
  child: (n: SemNode) => string[];
  /** Control → `@State` property name; built by `controlMembers`. */
  stateOf: Map<SemNode, string>;
  /** `Action.key` → callback member; built by `controlMembers`. */
  actionOf: Map<string, string>;
  /** Grouped radio → its tag in the group's selection; built by `controlMembers`. */
  radioTag: Map<SemNode, string>;
  mode: EmitMode;
  /** The screen's colour scheme (`adaptive`: both): `<progress>`/`<meter>`/`<input type=range>` are painted by the browser, whose palette follows it. */
  theme: Theme | "adaptive";
  /** This screen's colour → token lookup, and the control node its colours belong to. */
  tokens?: ScreenTokens;
  id?: string;
  /** The node's box modifiers, emitted inside a pressable control's label. */
  box?: string[];
  /** Pressable owner → its `@MarkswiftPressed` member; built by `controlMembers`. */
  pressOf?: Map<SemNode, string>;
  /** ARIA toggle Button → what its tap runs; built by `controlMembers`. */
  toggleOf?: ControlMembers["toggleOf"];
  /** Layer trigger → what its tap runs; built by `controlMembers`. */
  openOf?: ControlMembers["openOf"];
  /** A presentation's closing button → what its tap runs; built by `controlMembers`. */
  closeOf?: ControlMembers["closeOf"];
  /** Native menu toggle/radio item → its `@State` member; built by `controlMembers`. */
  menuState?: ControlMembers["menuState"];
  /** Text field → its `@MarkswiftFocused` member; built by `controlMembers`. */
  focusOf?: Map<SemNode, string>;
  /** Packaged face metrics: a field in a bundled face spaces its lines from that face's natural line. */
  fontMetrics?: FontMetrics;
}

/**
 * Chrome's palette for the widgets it paints itself. The page's CSS never mentions these colours
 * yet they are part of the design's pixels, so the generated view carries them the same way it
 * carries every other measured colour: resolved for the screen's theme, or as a light/dark pair
 * (`Color.markswift(light:dark:)` from MarkswiftRuntime.swift) for an adaptive view. Measured from Chrome 152.
 */
const UA: Record<Theme | "adaptive", { accent: string; track: string; edge: string }> = {
  light: {
    accent: "Color.markswift(0.0, 0.459, 1.0)",
    track: "Color.markswift(0.937, 0.937, 0.937)",
    edge: "Color.markswift(0.698, 0.698, 0.698)",
  },
  dark: {
    accent: "Color.markswift(0.6, 0.784, 1.0)",
    track: "Color.markswift(0.231, 0.231, 0.231)",
    edge: "Color.markswift(0.522, 0.522, 0.522)",
  },
  adaptive: {
    accent: "Color.markswift(light: Color.markswift(0.0, 0.459, 1.0), dark: Color.markswift(0.6, 0.784, 1.0))",
    track: "Color.markswift(light: Color.markswift(0.937, 0.937, 0.937), dark: Color.markswift(0.231, 0.231, 0.231))",
    edge: "Color.markswift(light: Color.markswift(0.698, 0.698, 0.698), dark: Color.markswift(0.522, 0.522, 0.522))",
  },
};
/**
 * Chrome's closed `<select>` (any `appearance` but `none`), px: the menulist's internal text padding inside the
 * author's (`PopupInternalPaddingStart` 4, `PopupInternalPaddingEnd` arrow box + 1) and the arrow box at the inner
 * border edge, its chevron centred in it. Measured in Chromium 153: a 59 px label in a 1 px border is 81 px wide with
 * native appearance and 61 px with `none`; the chevron's centre sits 7.5 px inside the right border.
 */
const MENU = { start: 4, end: 16, arrowBox: 15 };
/** Editable text controls: their own text is laid out in the CSS line box. */
export const FIELDS: Record<string, true> = { textField: true, secureField: true, textEditor: true };

export function controlExpr(n: ControlNode, deps: ControlDeps): string[] {
  const out = core(n, deps);
  if (n.font) {
    out.push(`.font(${fontExpr(n.font, deps)})`);
    // A field showing its placeholder paints it in the prompt colour — the page's `::placeholder` colour, else the
    // platform grey — as the browser does; in app mode the live control styles its own prompt and this would
    // colour the typed text instead.
    const prompt = deps.mode === "fidelity" && !n.value && n.placeholder !== undefined;
    if (prompt) out.push(`.foregroundStyle(${promptPaint(n, deps)})`);
    else if (n.color) out.push(`.foregroundStyle(${colorExpr(n.color, deps, deps.id)})`);
    // App mode: the CSS line box of a field's text — one line centred in it, an editor's lines spaced by it and its
    // half-leading above the first line — scaling with Dynamic Type like the font; leading over the face's natural line
    // (a bundled face's own metrics, else SF's).
    const lh = n.font.lineHeight;
    const family = n.font.family.kind === "custom" ? n.font.family.name : undefined;
    const face = family !== undefined ? deps.fontMetrics?.[family.toLowerCase()] : undefined;
    const editor =
      n.control === "textEditor"
        ? `, editor: true${family !== undefined ? `, face: ${str(family)}` : ""}`
        : `, capturedHeight: ${num(Math.max(0, n.frame.h - n.padding[0] - n.padding[2]))}`;
    if (deps.mode === "app" && FIELDS[n.control] && lh !== undefined && (family === undefined || face))
      out.push(
        `.markswiftFieldLineHeight(${num(lh)}, size: ${num(n.font.size)}, relativeTo: .${nearestTextStyle(n.font.size)}${face ? `, natural: ${num((face.ascent + face.descent + face.lineGap) / face.upem)}` : ""}${editor})`,
      );
  }
  // App mode carries the behaviour and takes SwiftUI's own dimming with it (`modifiers` drops
  // the design's `:disabled` opacity there so the two do not compound). Fidelity renders a still
  // image that nothing interacts with, and keeps the design's measured opacity instead.
  if (n.disabled && deps.mode === "app") out.push(".disabled(true)");
  return out;
}

function core(n: ControlNode, deps: ControlDeps): string[] {
  const state = deps.stateOf.get(n);
  const tag = deps.radioTag.get(n);
  // HTML: an unnamed radio is a group of its own; a tap selects it and nothing clears it.
  const binding = !state
    ? ""
    : tag !== undefined
      ? `$${state}.markswiftSelects(${str(tag)})`
      : n.control === "radio"
        ? `$${state}.markswiftSelects(true)`
        : `$${state}`;
  const still = deps.mode === "fidelity";
  const press = deps.pressOf?.get(n);
  const buttonStyle = press ? `.buttonStyle(MarkswiftPressStyle(isPressed: $${press}))` : ".buttonStyle(.plain)";
  // Fidelity draws the field's text, so nothing takes focus; the member still drives the box.
  const focus = deps.focusOf?.get(n);
  const focused = focus ? [`.focused($${focus})`] : [];
  switch (n.control) {
    case "button": {
      const action = n.action ? deps.actionOf.get(n.action.key) : undefined;
      // `<input type=file>`: the button's own job is to present the system picker, so its action
      // is the presentation flag and the design's box gains `.fileImporter`. The `accept` list
      // goes across as the attribute wrote it — one string literal however many tokens it has —
      // because only the running system can turn `image/*` or `.png` into a `UTType`.
      if (n.files && state) {
        return [
          "Button {",
          `    ${state} = true`,
          "} label: {",
          ...indent(pressable(n, deps), 1),
          "}",
          buttonStyle,
          "// The design only says a file is chosen here; fill in what to do with it.",
          `.fileImporter(isPresented: ${binding}, allowedContentTypes: markswiftContentTypes(${str(n.files.accept.join(","))}), allowsMultipleSelection: ${n.files.multiple ? "true" : "false"}) { _ in }`,
        ];
      }
      // A menu trigger: the same label opens the native menu instead.
      if (n.menu && !n.menu.context) return menuButton(n.menu, pressable(n, deps), buttonStyle, deps);
      // An ARIA toggle (`role=checkbox|switch|radio`), a layer trigger or a presentation's closing button: the tap
      // changes the screen's state and acts.
      const tap = deps.toggleOf?.get(n)?.tap ?? deps.openOf?.get(n)?.tap ?? deps.closeOf?.get(n);
      if (tap) return ["Button {", ...indent(tap, 1), "} label: {", ...indent(pressable(n, deps), 1), "}", buttonStyle];
      return wrap(`Button(action: ${action ?? "{}"}) {`, pressable(n, deps), ["}", buttonStyle]);
    }
    case "link": {
      // Only an absolute URL has a destination outside the app. `#anchor` and `/path` are in-app
      // navigation the generated view cannot resolve, so the element becomes a button over the
      // placeholder callback `controlMembers` declared for its target — the same shape an
      // `onclick` handler gets, and named after whatever the design called the target.
      const href = n.href ?? "";
      if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        const action = n.action ? deps.actionOf.get(n.action.key) : undefined;
        return wrap(`Button(action: ${action ?? "{}"}) {`, pressable(n, deps), [
          "}",
          buttonStyle,
          // An in-app `<a>` emitted as a Button is still a link.
          ".accessibilityRemoveTraits(.isButton)",
          ".accessibilityAddTraits(.isLink)",
        ]);
      }
      return wrap(`Link(destination: markswiftURL(${str(href)})) {`, pressable(n, deps), ["}"]);
    }
    case "textField":
      if (still) return painted(n.value ?? n.placeholder ?? "", ".leading");
      return [
        `TextField(${str(n.placeholder ?? "")}, text: ${binding}${promptArg(n, deps)})`,
        // `.plain`: the CSS box is the field's chrome; macOS would otherwise draw its bezel inside it.
        ".textFieldStyle(.plain)",
        ...focused,
        ...inputTraits(n),
        ...(n.action ? [`.onSubmit { ${deps.actionOf.get(n.action.key)}() }`] : []),
      ];
    case "secureField":
      // The browser paints one bullet per character of the value.
      if (still) return painted(n.value ? "\u2022".repeat(n.value.length) : (n.placeholder ?? ""), ".leading");
      return [
        `SecureField(${str(n.placeholder ?? "")}, text: ${binding}${promptArg(n, deps)})`,
        // `.plain`: the CSS box is the field's chrome; macOS would otherwise draw its bezel inside it.
        ".textFieldStyle(.plain)",
        ...focused,
        ...inputTraits(n),
        ...(n.action ? [`.onSubmit { ${deps.actionOf.get(n.action.key)}() }`] : []),
      ];
    case "textEditor":
      if (still) return painted(n.value ?? n.placeholder ?? "", ".topLeading");
      // The node paints its own background; the editor's would sit on top of it, and so would iOS 26's
      // scroll edge effect over the first line. The editor insets its text inside its frame, which the
      // CSS padding already does. It has no `prompt:` init: the placeholder overlay, in the prompt paint,
      // is drawn while the text is empty, where the first line starts. It is as tall as its text (or the
      // placeholder) at the native font, so Dynamic Type grows it; the captured height stays the minimum
      // (`frameModifier`).
      return [
        `TextEditor(text: ${binding})`,
        ".scrollContentBackground(.hidden)",
        ".markswiftScrollEdgeEffectHidden()",
        ".markswiftTextEditorInsets()",
        ...(state
          ? [`.markswiftFitsText(${n.placeholder ? `${state}.isEmpty ? ${str(n.placeholder)} : ${state}` : state})`]
          : []),
        ...focused,
        ...(n.placeholder && state
          ? [
              ".overlay(alignment: .topLeading) {",
              `    if ${state}.isEmpty {`,
              `        Text(verbatim: ${str(n.placeholder)})`,
              `        .foregroundStyle(${promptPaint(n, deps)})`,
              "        .allowsHitTesting(false)",
              "    }",
              "}",
            ]
          : []),
      ];
    case "toggle":
    case "radio": {
      // A switch is the right control only when the design drew one: HTML checkboxes and radios
      // are small squares/circles, and an iOS switch would not fit their measured box.
      const tint = n.accent ? colorExpr(n.accent, deps, deps.id) : UA[deps.theme].accent;
      const style =
        n.control === "radio"
          ? `MarkswiftMarkToggleStyle(mark: .dot, tint: ${tint})`
          : n.frame.w >= n.frame.h * 1.4 && n.frame.w >= 28
            ? ".switch"
            : `MarkswiftMarkToggleStyle(mark: .check, tint: ${tint})`;
      const out = wrap(`Toggle(isOn: ${binding}) {`, body(n, deps), ["}", `.toggleStyle(${style})`]);
      if (style === ".switch" && n.accent) out.push(`.tint(${tint})`);
      // The drawn style ignores the label, so VoiceOver gets a plain Toggle named by the `<label>`
      // (or `aria-label`); the representation does not inherit the visible style. Its label is no
      // `Text`: one would be laid out in the mark's frame (growing it) and audited as clipped text.
      if (n.a11y?.label)
        out.push(
          ".accessibilityRepresentation {",
          `    Toggle(isOn: ${binding}) { EmptyView() }.accessibilityLabel(Text(verbatim: ${str(n.a11y.label)}))`,
          "}",
        );
      return out;
    }
    case "slider": {
      const r = n.range ?? { min: 0, max: 100 };
      const tint = n.accent ? colorExpr(n.accent, deps, deps.id) : UA[deps.theme].accent;
      if (still)
        return [
          `MarkswiftSliderTrack(fraction: ${num(fraction(n))}, height: ${num(n.frame.h)}, tint: ${tint}, track: ${UA[deps.theme].track}, edge: ${UA[deps.theme].edge})`,
        ];
      return [
        `Slider(value: ${binding}, in: ${num(r.min)}...${num(Math.max(r.max, r.min + 0.001))}${r.step ? `, step: ${num(r.step)}` : ""})`,
        ...(n.accent ? [`.tint(${tint})`] : []),
      ];
    }
    case "stepper": {
      const r = n.range ?? { min: 0, max: 100 };
      if (still) return painted(n.value ?? "", ".leading");
      return [
        `Stepper(value: ${binding}, in: ${num(r.min)}...${num(Math.max(r.max, r.min + 0.001))}${r.step ? `, step: ${num(r.step)}` : ""}) {`,
        "    EmptyView()",
        "}",
        ".labelsHidden()",
      ];
    }
    case "picker": {
      // Closed, a picker shows its selection and, unless `appearance: none` removed it, the
      // browser's arrow. App mode keeps that look as a Menu label (never the option list) over an
      // inline Picker, so the native menu and selection behaviour stay.
      const ua = n.appearance !== "none";
      // Chrome's menulist pads its text inside the author's padding: 4 px at the start, the arrow box + 1 at the end.
      const pad = ua
        ? [`.padding(EdgeInsets(top: 0.0, leading: ${num(MENU.start)}, bottom: 0.0, trailing: ${num(MENU.end)}))`]
        : [];
      // The arrow box sits at the inner border edge, over the author's end padding (Chrome's `SetupMenuListArrow`).
      const inset = n.padding[1] - (n.style.border?.width ?? n.style.borderSides?.right?.width ?? 0);
      const arrow = ua
        ? [
            ".overlay(alignment: .trailing) {",
            '    Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold))',
            `    .frame(width: ${num(MENU.arrowBox)})`,
            ...(inset > 0 ? [`    .padding(.trailing, ${num(-inset)})`] : []),
            "}",
          ]
        : [];
      if (still)
        return [
          `Text(verbatim: ${str(n.value ?? "")})`,
          ...pad,
          ".frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)",
          ...arrow,
        ];
      const rows = pickerRows(n.options?.length ? n.options : n.value !== undefined ? [{ label: n.value }] : []);
      return [
        "Menu {",
        `    Picker(selection: ${binding}) {`,
        ...indent(rows, 2),
        "    } label: {",
        "        EmptyView()",
        "    }",
        "    .pickerStyle(.inline)",
        "} label: {",
        `    Text(verbatim: ${state ?? '""'})`,
        ...indent(pad, 1),
        ...(n.width.kind === "hug" ? [] : ["    .frame(maxWidth: .infinity, alignment: .leading)"]),
        ...indent(arrow, 1),
        "    .contentShape(Rectangle())",
        "}",
        ".menuStyle(.button)",
        ".buttonStyle(.plain)",
        ".menuIndicator(.hidden)",
        ...(state ? [`.accessibilityValue(${state})`] : []),
      ];
    }
    case "datePicker":
      if (still) return painted(n.value ?? "", ".leading");
      return [
        `DatePicker(selection: ${binding}, displayedComponents: ${DATE_COMPONENTS[n.dateKind ?? "date"]}) {`,
        ...indent(body(n, deps), 1),
        "}",
        ".labelsHidden()",
      ];
    case "colorPicker": {
      const c = n.swatch ?? { r: 0, g: 0, b: 0, a: 1 };
      if (still)
        return [`RoundedRectangle(cornerRadius: 4.0, style: .circular).fill(Color.markswift(${colorArgs(c)}))`];
      return [`ColorPicker(selection: ${binding}) {`, ...indent(body(n, deps), 1), "}", ".labelsHidden()"];
    }
    case "progress": {
      const ua = UA[deps.theme];
      const tint = n.accent ? colorExpr(n.accent, deps, deps.id) : ua.accent;
      const bar = `.progressViewStyle(MarkswiftBarProgressStyle(height: ${num(barHeight(n))}, tint: ${tint}, track: ${ua.track}, edge: ${ua.edge}))`;
      // Qualified: a generated view is named `<Screen>View`, which can be `ProgressView` itself.
      if (n.value === undefined) return ["SwiftUI.ProgressView()", bar];
      return [`SwiftUI.ProgressView(value: ${num(fraction(n))})`, bar];
    }
    case "gauge": {
      const r = n.range ?? { min: 0, max: 1 };
      const v = Number(n.value ?? r.min);
      return [
        `Gauge(value: ${num(Number.isFinite(v) ? v : r.min)}, in: ${num(r.min)}...${num(Math.max(r.max, r.min + 0.001))}) {`,
        "    EmptyView()",
        "}",
        `.gaugeStyle(MarkswiftBarGaugeStyle(height: ${num(barHeight(n))}, tint: ${LEVEL_TINT[n.level ?? "optimum"]}, track: ${UA[deps.theme].track}, edge: ${UA[deps.theme].edge}))`,
      ];
    }
    case "disclosure": {
      // The summary (with its `::marker` run) is the whole label; the runtime style draws no system
      // chevron and keeps the measured summary → content gap. The marker follows the state.
      const first = n.content[0];
      const gap = n.label && first ? Math.max(0, first.frame.y - (n.label.frame.y + n.label.frame.h)) : 0;
      // ponytail: the marker swaps only when the summary is emitted inline (a text label); a summary
      // split into its own `v_*` property keeps its captured marker.
      const label = (n.label ? deps.child(n.label) : ["EmptyView()"]).map((l) =>
        state
          ? l.replace(
              MARKER,
              (_, closed: string) =>
                `Text(verbatim: ${state} ? "\u25be " : ${str(`${closed === "\u25be" ? "\u25b8" : closed} `)})`,
            )
          : l,
      );
      // App: the content's CSS height animation opens and closes it.
      const reveal = deps.mode === "app" ? n.motion?.reveal : undefined;
      const curves = reveal ? `, open: ${animationExpr(reveal.open)}, close: ${animationExpr(reveal.close)}` : "";
      return [
        `DisclosureGroup(isExpanded: ${binding}) {`,
        ...indent(n.content.length ? stackOfNodes(n, n.content, deps) : ["EmptyView()"], 1),
        "} label: {",
        ...indent(label, 1),
        "}",
        `.disclosureGroupStyle(MarkswiftDisclosureStyle(spacing: ${num(gap)}${curves}))`,
      ];
    }
  }
}

const DATE_COMPONENTS: Record<NonNullable<ControlNode["dateKind"]>, string> = {
  date: ".date",
  time: ".hourAndMinute",
  "datetime-local": "[.date, .hourAndMinute]",
  month: ".date",
  week: ".date",
};

/** Chrome's `::marker` text for `<summary>`: ▸ closed (◂ right-to-left), ▾ open. */
const MARKER = /Text\(verbatim: "([\u25b8\u25be\u25c2]) "\)/;

/** What iOS Safari gives the same field: keyboard, autofill type and Return key, via the iOS-only `markswiftInputTraits` (runtime/controls.swift). */
function inputTraits(n: ControlNode): string[] {
  const args = [
    n.inputType ? `.${n.inputType}` : "",
    n.autofill ? `autofill: ${str(n.autofill)}` : "",
    n.inputMode ? `inputMode: ${str(n.inputMode)}` : "",
    n.enterKey ? `enterKey: ${str(n.enterKey)}` : "",
  ].filter(Boolean);
  return args.length ? [`.markswiftInputTraits(${args.join(", ")})`] : [];
}

/**
 * `<meter>` state colours, as every browser paints them: the value sits in its optimum band, one
 * band away, or in the worst band.
 */
const LEVEL_TINT: Record<NonNullable<ControlNode["level"]>, string> = {
  optimum: "Color.markswift(0.063, 0.486, 0.063)",
  suboptimal: "Color.markswift(1.0, 0.725, 0.0)",
  poor: "Color.markswift(0.847, 0.231, 0.004)",
};

/** A field's placeholder paint: the page's `::placeholder` colour (token slot `prompt`), else the platform's prompt grey. */
function promptPaint(n: ControlNode, deps: ControlDeps): string {
  return n.promptColor ? colorExpr(n.promptColor, deps, deps.id, "prompt") : "Color.markswiftPlaceholderText";
}

/** `TextField`/`SecureField` `prompt:` argument; none without an author colour, so the title stays the platform-grey prompt. */
function promptArg(n: ControlNode, deps: ControlDeps): string {
  return n.promptColor
    ? `, prompt: Text(verbatim: ${str(n.placeholder ?? "")}).foregroundStyle(${promptPaint(n, deps)})`
    : "";
}

/** Text the browser painted inside a field, for the modes that cannot host a live control. */
function painted(text: string, alignment: string): string[] {
  return [`Text(verbatim: ${str(text)})`, `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${alignment})`];
}

/** Where `value` sits in the control's range, 0…1. */
function fraction(n: ControlNode): number {
  const r = n.range ?? { min: 0, max: 1 };
  const span = r.max - r.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (numericValue(n) - r.min) / span));
}

/**
 * Height of the bar inside a `<progress>`/`<meter>` box. The browser's native widget does not
 * fill the element: it paints a track of half the box height, centred (measured in Chrome at box
 * heights of 12 and 30 px).
 */
function barHeight(n: ControlNode): number {
  return Math.round(n.frame.h * 50) / 100;
}

/** The control's label/content view: its laid-out children, or nothing. */
function body(n: ControlNode, deps: ControlDeps): string[] {
  const nodes = n.label ? [n.label, ...n.content] : n.content;
  return nodes.length ? stackOfNodes(n, nodes, deps) : ["EmptyView()"];
}

/**
 * An input button's caption (`@value`, or Chrome's "Submit"/"Reset"), painted by the control:
 * centred across a fill-width box, as Chrome centres it. One line, as the browser never wraps it; the UA font (Arial)
 * maps to the wider SF Pro, so the caption shrinks into the measured width instead of wrapping or truncating.
 */
function caption(n: ControlNode): string[] | undefined {
  if (n.control !== "button" || n.files || n.value === undefined || n.content.length) return undefined;
  return [
    `Text(verbatim: ${str(n.value)})`,
    ".lineLimit(1)",
    // ponytail: 0.8 covers SF Pro over Arial (~6 % wider); a caption that still overflows truncates.
    ".minimumScaleFactor(0.8)",
    ...(n.width.kind === "fill" ? [".frame(maxWidth: .infinity)"] : []),
  ];
}

/**
 * A button's or link's label with the node's box inside it, closed by the box shape: the whole box
 * is the hit and press area, not only the glyphs. `EmptyView` takes no padding or frame, so an
 * empty label with a box becomes `Color.clear`.
 */
function pressable(n: ControlNode, deps: ControlDeps): string[] {
  const label = caption(n) ?? body(n, deps);
  if (!deps.box) return label;
  const lines = deps.box.length && label.length === 1 && label[0] === "EmptyView()" ? ["Color.clear"] : label;
  return [...lines, ...deps.box, `.contentShape(${shapeExpr(n.style, n.frame.w, n.frame.h)})`];
}

function wrap(open: string, inner: string[], close: string[]): string[] {
  return [open, ...indent(inner, 1), ...close];
}

/** An inline Picker's rows: consecutive options of one group are a Section headed by its label; disabled ones stay listed, greyed. */
function pickerRows(options: PickerOption[]): string[] {
  const runs: PickerOption[][] = [];
  for (const o of options) {
    const run = runs.at(-1);
    if (run && run[0]!.group === o.group) run.push(o);
    else runs.push([o]);
  }
  return (runs.length ? runs : [[]]).flatMap((run) => {
    const off = run.filter((o) => o.disabled).map((o) => str(o.label));
    const each = [
      `ForEach(${run.length ? `[${run.map((o) => str(o.label)).join(", ")}]` : "[String]()"}, id: \\.self) { option in`,
      "    Text(option)",
      ...(!off.length
        ? []
        : off.length === run.length
          ? ["        .disabled(true)"]
          : [`        .disabled([${off.join(", ")}].contains(option))`]),
      "}",
    ];
    const group = run[0]?.group;
    return group === undefined
      ? each
      : ["Section {", ...indent(each, 1), "} header: {", `    Text(verbatim: ${str(group)})`, "}"];
  });
}

/**
 * A captured menu's items as native menu content: buttons on the screen's action members, checkbox items as
 * Toggles, a radio run as an inline Picker, separators, labelled sections.
 */
// ponytail: a submenu is a disabled label (its items are not captured); opening nested triggers is the upgrade path.
export function menuExpr(items: MenuItem[], deps: Pick<ControlDeps, "actionOf" | "menuState">): string[] {
  return items.flatMap((i): string[] => {
    const label = "label" in i ? [`    Text(verbatim: ${str(i.label)})`] : [];
    const off = "disabled" in i && i.disabled ? [".disabled(true)"] : [];
    const state = "id" in i ? deps.menuState?.get(i.id) : undefined;
    switch (i.kind) {
      case "button": {
        const action = (i.action && deps.actionOf.get(i.action.key)) ?? "{}";
        return [`Button(${i.destructive ? "role: .destructive, " : ""}action: ${action}) {`, ...label, "}", ...off];
      }
      case "toggle":
        return [`Toggle(isOn: ${state ? `$${state}` : ".constant(false)"}) {`, ...label, "}", ...off];
      case "radio":
        return [
          `Picker(selection: ${state ? `$${state}` : '.constant("")'}) {`,
          ...indent(pickerRows(i.options), 1),
          "} label: {",
          "    EmptyView()",
          "}",
          ".pickerStyle(.inline)",
        ];
      case "divider":
        return ["Divider()"];
      case "section":
        return ["Section {", ...indent(menuExpr(i.items, deps), 1), "} header: {", ...label, "}"];
      default: // submenu
        return ["Menu {", "} label: {", ...label, "}", ".disabled(true)"];
    }
  });
}

/** A menu trigger: its Button's label and style around a native `Menu` of the captured items. */
export function menuButton(
  menu: MenuSpec,
  label: string[],
  buttonStyle: string,
  deps: Pick<ControlDeps, "actionOf" | "menuState">,
): string[] {
  return [
    "Menu {",
    ...indent(menuExpr(menu.items, deps), 1),
    "} label: {",
    ...indent(label, 1),
    "}",
    ".menuStyle(.button)",
    buttonStyle,
    ".menuIndicator(.hidden)",
    ".menuOrder(.fixed)",
  ];
}

/**
 * Several children inside one control: stacked the way the browser laid them out — side by side
 * when their boxes do not overlap horizontally, otherwise one under the other, with the measured
 * gap between the first pair.
 */
function stackOfNodes(n: ControlNode, content: SemNode[], deps: ControlDeps): string[] {
  if (content.length === 1) return deps.child(content[0]!);
  const app = deps.mode === "app";
  // App mode: content is in reading order (top first), so a trailing icon nudged a pixel above its label comes first;
  // side by side is judged left to right. Fidelity keeps the reading-order test.
  const nodes = app ? [...content].sort((a, b) => a.frame.x - b.frame.x) : content;
  let horizontal = true;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]!.frame,
      b = nodes[i]!.frame;
    if (b.x < a.x + a.w - 0.5) horizontal = false;
  }
  const ordered = horizontal ? nodes : content;
  const [a, b] = [ordered[0]!.frame, ordered[1]!.frame];
  const gap = Math.max(0, Math.round((horizontal ? b.x - (a.x + a.w) : b.y - (a.y + a.h)) * 100) / 100);
  // App mode: a pair pushed to both content edges of a box wider than it (`justify-content: space-between`) keeps the
  // edges when native text grows or shrinks, instead of a fixed spacing that squeezes the label.
  // ponytail: Spacer minimum 0 — the CSS column-gap is not in the IR; add it to ControlNode if a wrapped label must keep
  // its distance from the trailing icon.
  const spread =
    app &&
    horizontal &&
    ordered.length === 2 &&
    n.width.kind !== "hug" &&
    Math.abs(a.x - (n.frame.x + n.padding[3])) <= 1 &&
    Math.abs(b.x + b.w - (n.frame.x + n.frame.w - n.padding[1])) <= 1;
  const children = ordered.map((c) => deps.child(c));
  if (spread)
    return [
      "HStack(alignment: .center, spacing: 0.0) {",
      ...indent([...children[0]!, "Spacer(minLength: 0.0)", ...children[1]!], 1),
      "}",
    ];
  const open = horizontal
    ? `HStack(alignment: .center, spacing: ${num(gap)}) {`
    : `VStack(alignment: .leading, spacing: ${num(gap)}) {`;
  return [open, ...indent(children.flat(), 1), "}"];
}
