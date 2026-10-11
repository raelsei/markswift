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
import type { ControlNode, SemNode } from "../model/semantic.ts";
import type { ColorCtx, EmitMode, ScreenTokens } from "./context.ts";
import { numericValue } from "./control-state.ts";
import { colorArgs, colorExpr, fontExpr, indent, num, str } from "./format.ts";
import { shapeExpr } from "./paint.ts";

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

export function controlExpr(n: ControlNode, deps: ControlDeps): string[] {
  const out = core(n, deps);
  if (n.font) {
    out.push(`.font(${fontExpr(n.font, deps)})`);
    // A field showing its placeholder paints it in the prompt colour, as the browser does; in app
    // mode the live control styles its own prompt and this would colour the typed text instead.
    const prompt = deps.mode === "fidelity" && !n.value && n.placeholder !== undefined;
    if (prompt) out.push(".foregroundStyle(Color.markswiftPlaceholderText)");
    else if (n.color) out.push(`.foregroundStyle(${colorExpr(n.color, deps, deps.id)})`);
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
  const binding = !state ? "" : tag !== undefined ? `$${state}.markswiftSelects(${str(tag)})` : `$${state}`;
  const still = deps.mode === "fidelity";
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
          ".buttonStyle(.plain)",
          "// The design only says a file is chosen here; fill in what to do with it.",
          `.fileImporter(isPresented: ${binding}, allowedContentTypes: markswiftContentTypes(${str(n.files.accept.join(","))}), allowsMultipleSelection: ${n.files.multiple ? "true" : "false"}) { _ in }`,
        ];
      }
      return wrap(`Button(action: ${action ?? "{}"}) {`, pressable(n, deps), ["}", ".buttonStyle(.plain)"]);
    }
    case "link": {
      // Only an absolute URL has a destination outside the app. `#anchor` and `/path` are in-app
      // navigation the generated view cannot resolve, so the element becomes a button over the
      // placeholder callback `controlMembers` declared for its target — the same shape an
      // `onclick` handler gets, and named after whatever the design called the target.
      const href = n.href ?? "";
      if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        const action = n.action ? deps.actionOf.get(n.action.key) : undefined;
        return wrap(`Button(action: ${action ?? "{}"}) {`, pressable(n, deps), ["}", ".buttonStyle(.plain)"]);
      }
      return wrap(`Link(destination: markswiftURL(${str(href)})) {`, pressable(n, deps), ["}"]);
    }
    case "textField":
      if (still) return painted(n.value ?? n.placeholder ?? "", ".leading");
      return [
        `TextField(${str(n.placeholder ?? "")}, text: ${binding})`,
        // `.plain`: the CSS box is the field's chrome; macOS would otherwise draw its bezel inside it.
        ".textFieldStyle(.plain)",
        ...(n.inputType ? INPUT_TRAITS[n.inputType] : []),
        ...(n.action ? [`.onSubmit { ${deps.actionOf.get(n.action.key)}() }`] : []),
      ];
    case "secureField":
      // The browser paints one bullet per character of the value.
      if (still) return painted(n.value ? "\u2022".repeat(n.value.length) : (n.placeholder ?? ""), ".leading");
      return [
        `SecureField(${str(n.placeholder ?? "")}, text: ${binding})`,
        // `.plain`: the CSS box is the field's chrome; macOS would otherwise draw its bezel inside it.
        ".textFieldStyle(.plain)",
        ...(n.inputType ? INPUT_TRAITS[n.inputType] : []),
        ...(n.action ? [`.onSubmit { ${deps.actionOf.get(n.action.key)}() }`] : []),
      ];
    case "textEditor":
      if (still) return painted(n.value ?? n.placeholder ?? "", ".topLeading");
      // The node paints its own background; the editor's would sit on top of it. The editor insets
      // its text inside its frame, which the CSS padding already does. It has no prompt: the
      // placeholder is drawn while the text is empty, where the first line starts.
      return [
        `TextEditor(text: ${binding})`,
        ".scrollContentBackground(.hidden)",
        ".markswiftTextEditorInsets()",
        ...(n.placeholder && state
          ? [
              ".overlay(alignment: .topLeading) {",
              `    if ${state}.isEmpty {`,
              `        Text(verbatim: ${str(n.placeholder)})`,
              "        .foregroundStyle(Color.markswiftPlaceholderText)",
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
      // (or `aria-label`); the representation does not inherit the visible style.
      if (n.a11y?.label)
        out.push(
          ".accessibilityRepresentation {",
          `    Toggle(isOn: ${binding}) { Text(verbatim: ${str(n.a11y.label)}) }`,
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
      const arrow = n.appearance === "none" ? [] : ['    Image(systemName: "chevron.down")'];
      if (still) return ["HStack(spacing: 4.0) {", ...indent(painted(n.value ?? "", ".leading"), 1), ...arrow, "}"];
      const options = n.options?.length ? n.options : n.value !== undefined ? [n.value] : [];
      return [
        "Menu {",
        `    Picker(selection: ${binding}) {`,
        `        ForEach(${options.length ? `[${options.map(str).join(", ")}]` : "[String]()"}, id: \\.self) { option in`,
        "            Text(option)",
        "        }",
        "    } label: {",
        "        EmptyView()",
        "    }",
        "    .pickerStyle(.inline)",
        "} label: {",
        "    HStack(spacing: 4.0) {",
        `        Text(verbatim: ${state ?? '""'})`,
        ...(n.width.kind === "hug" ? [] : ["        .frame(maxWidth: .infinity, alignment: .leading)"]),
        ...(arrow.length ? ['        Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold))'] : []),
        "    }",
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
      return [
        `DisclosureGroup(isExpanded: ${binding}) {`,
        ...indent(n.content.length ? stackOfNodes(n.content, deps) : ["EmptyView()"], 1),
        "} label: {",
        ...indent(label, 1),
        "}",
        `.disclosureGroupStyle(MarkswiftDisclosureStyle(spacing: ${num(gap)}))`,
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

/** What iOS Safari gives the same input; `markswiftInputTraits` applies it on iOS only (runtime/controls.swift). */
const INPUT_TRAITS: Record<NonNullable<ControlNode["inputType"]>, string[]> = {
  email: [".markswiftInputTraits(.email)"],
  tel: [".markswiftInputTraits(.tel)"],
  url: [".markswiftInputTraits(.url)"],
  number: [".markswiftInputTraits(.number)"],
  search: [".markswiftInputTraits(.search)"],
  password: [".markswiftInputTraits(.password)"],
};

/**
 * `<meter>` state colours, as every browser paints them: the value sits in its optimum band, one
 * band away, or in the worst band.
 */
const LEVEL_TINT: Record<NonNullable<ControlNode["level"]>, string> = {
  optimum: "Color.markswift(0.063, 0.486, 0.063)",
  suboptimal: "Color.markswift(1.0, 0.725, 0.0)",
  poor: "Color.markswift(0.847, 0.231, 0.004)",
};

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
  return nodes.length ? stackOfNodes(nodes, deps) : ["EmptyView()"];
}

/**
 * An input button's caption (`@value`, or Chrome's "Submit"/"Reset"), painted by the control:
 * centred across a fill-width box, as Chrome centres it.
 */
function caption(n: ControlNode): string[] | undefined {
  if (n.control !== "button" || n.files || n.value === undefined || n.content.length) return undefined;
  return [`Text(verbatim: ${str(n.value)})`, ...(n.width.kind === "fill" ? [".frame(maxWidth: .infinity)"] : [])];
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

/**
 * Several children inside one control: stacked the way the browser laid them out — side by side
 * when their boxes do not overlap horizontally, otherwise one under the other, with the measured
 * gap between the first pair.
 */
function stackOfNodes(nodes: SemNode[], deps: ControlDeps): string[] {
  if (nodes.length === 1) return deps.child(nodes[0]!);
  let horizontal = true;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1]!.frame,
      b = nodes[i]!.frame;
    if (b.x < a.x + a.w - 0.5) horizontal = false;
  }
  const [a, b] = [nodes[0]!.frame, nodes[1]!.frame];
  const gap = Math.max(0, Math.round((horizontal ? b.x - (a.x + a.w) : b.y - (a.y + a.h)) * 100) / 100);
  const open = horizontal
    ? `HStack(alignment: .center, spacing: ${num(gap)}) {`
    : `VStack(alignment: .leading, spacing: ${num(gap)}) {`;
  return [
    open,
    ...indent(
      nodes.flatMap((c) => deps.child(c)),
      1,
    ),
    "}",
  ];
}
