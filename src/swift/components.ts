/**
 * Repeated siblings → one nested subview plus a static data array iterated with `ForEach` (app
 * mode). The emitter is the equality test: every node is emitted once with a placeholder line per
 * child it asks `ctx.renderNode` for, and siblings whose emitted Swift differs only in design
 * literals (strings, colours, shapes, control state/action names) form a run. The subview is the
 * first member's own emitted code with the differing literals read from its row, so the pixels are
 * the unrolled view's by construction. Names come from the markup (`componentNames`).
 */
import type { CounterStyle, GridNode, Screen, SemNode, StackNode, TextRun } from "../model/semantic.ts";
import type { ControlMembers, EmitContext, EmitOptions } from "./context.ts";
import { note } from "./diagnostics.ts";
import { indent, memberName, num, pascalWords, str } from "./format.ts";
import { containerExpr } from "./layout.ts";
import { refOf } from "./nodes.ts";
import { visit } from "./traversal.ts";

/** A design literal in a node's own Swift; offsets into `own`. */
interface Slot {
  start: number;
  end: number;
  /** `S` string, `C` colour, `I` shape, else the control member's `<kind>:<type>` (`$` kept for a binding). */
  marker: string;
  value: string;
}

interface NodeTemplate {
  /** The node's own lines joined with "\n"; each child is a line `<indent>\u0000<k>`. */
  own: string;
  /** Exactly the nodes the emitter asked `ctx.renderNode` for, in call order. */
  children: SemNode[];
  /** Design literals in `own`, in text order. */
  slots: Slot[];
  /** Equality key of the whole subtree (interned). */
  key: string;
}

/**
 * What a slot column becomes. `field`: a `Row` field; `literal`: kept as emitted; `binding`/`pass`:
 * the screen's state/action handed through; `collapse`: per-row actions as one `(Row) -> Void`;
 * `move`: per-row pressed/focused state declared in the subview; `counter`: a list marker derived
 * from the row's `ordinal`.
 */
type Role = "field" | "literal" | "binding" | "pass" | "collapse" | "move" | "counter";

/** Swift `MarkswiftCounterStyle` case of each counter style (runtime/counter.swift). */
const SWIFT_COUNTER: Readonly<Record<CounterStyle, string>> = {
  decimal: "decimal",
  "decimal-leading-zero": "decimalLeadingZero",
  "lower-alpha": "lowerAlpha",
  "upper-alpha": "upperAlpha",
  "lower-roman": "lowerRoman",
  "upper-roman": "upperRoman",
};

type Counter = Omit<NonNullable<TextRun["counter"]>, "value">;

/** A counter-marker column of a row type: the shared counter, and each run's first value and step. */
interface CounterColumn {
  counter: Counter;
  ords: Map<Run, { first: number; step: number }>;
}

/**
 * A string column whose every value is a counter run the browser printed (`::marker`, `counter()`) of one
 * style/prefix/suffix, an arithmetic progression per run.
 */
function counterColumn(group: Run[], c: number): CounterColumn | undefined {
  let counter: Counter | undefined;
  const ords = new Map<Run, { first: number; step: number }>();
  for (const run of group) {
    const col = run.columns[c]!;
    const values: number[] = [];
    for (const [i, node] of col.nodes.entries()) {
      const r = node.kind === "text" ? node.runs.find((x) => x.counter && str(x.text) === col.values[i]) : undefined;
      if (!r?.counter) return undefined;
      const { value, ...shape } = r.counter;
      counter ??= shape;
      if (shape.style !== counter.style || shape.prefix !== counter.prefix || shape.suffix !== counter.suffix)
        return undefined;
      values.push(value);
    }
    const first = values[0]!;
    const step = values[1]! - first;
    if (step === 0 || values.some((v, i) => v !== first + step * i)) return undefined;
    ords.set(run, { first, step });
  }
  return counter && { counter, ords };
}

interface Run {
  /** The stack or grid holding the members. */
  parent: StackNode | GridNode;
  /** The run's members, in order. */
  members: SemNode[];
  /**
   * Per slot column (DFS order over a member): marker, each member's value and slot node, and the
   * first member's text before the slot on its line (a colour's role).
   */
  columns: Array<{ marker: string; values: string[]; nodes: SemNode[]; at: string }>;
  /**
   * First column whose value vector equals this one's (`$` stripped): columns sharing one field or
   * parameter. Design-literal columns are classed and given their role over every run of the type.
   */
  cls: number[];
  roles: Role[];
  forEach: boolean;
  /** Runs with equal signatures share one row type and subview. */
  sig: string;
}

export interface Extraction {
  /** Lines for a run member or an annotated text, undefined for any other node. */
  call(node: SemNode): string[] | undefined;
  /** Every node inside a run member (all members). */
  absorbed: Set<SemNode>;
  /** The screen's members replacing `ctx.control.members`, in declaration (= `init` parameter) order. */
  members: ScreenMember[];
  /** Screen `@State` renamed to its annotated field: old → new, applied to the screen body. */
  rename: Record<string, string>;
  /** `extension <View> { … }` body lines; empty without runs. */
  extension: string[];
  /** One `#Preview` per extracted subview. */
  previews: string[];
}

const isContainer = (n: SemNode): n is StackNode | GridNode => n.kind === "stack" || n.kind === "grid";
const strip = (v: string) => v.replace(/^\$/, "");
/** A member name without its deduplication counter (`onEdit2` → `onEdit`): members named alike. */
const stem = (v: string) => strip(v).replace(/\d+$/, "");
const LITERAL: Record<string, true> = { S: true, C: true, I: true };
/** A child's placeholder line: indent, NUL, the child's index in the template. */
const PLACEHOLDER = new RegExp("^( *)\\u0000(\\d+)$");

/** Each node's own emitted Swift with a placeholder per child, its design literals and its subtree key. */
function nodeTemplates(root: SemNode, ctx: EmitContext): Map<SemNode, NodeTemplate> {
  const out = new Map<SemNode, NodeTemplate>();
  const interned = new Map<string, string>();
  const kinds = new Map(
    ctx.control.members.map((m) => [m.name, m.kind === "action" ? "action" : `${m.kind}:${m.type}`]),
  );
  const names = [...kinds.keys()].sort((a, b) => b.length - a.length);
  const token = new RegExp(
    `"(?:[^"\\\\]|\\\\.)*"|Color\\.markswift\\(|Palette\\.[A-Za-z_]\\w*|MarkswiftShape_[0-9a-f]+\\(\\)` +
      (names.length ? `|(?<![\\w$])\\$?(?:${names.join("|")})\\b` : ""),
    "g",
  );
  let opaque = 0;
  const build = (n: SemNode): NodeTemplate => {
    const cached = out.get(n);
    if (cached) return cached;
    const children: SemNode[] = [];
    const tctx: EmitContext = {
      ...ctx,
      renderNode: (c) => {
        children.push(c);
        return [`\u0000${children.length - 1}`];
      },
    };
    const own = (isContainer(n) ? containerExpr(n, tctx) : refOf(n, tctx)).join("\n");
    const slots: Slot[] = [];
    let shape = "";
    let last = 0;
    token.lastIndex = 0;
    for (let m = token.exec(own); m; m = token.exec(own)) {
      const t = m[0];
      const start = m.index;
      let end = start + t.length;
      let marker: string;
      if (t[0] === '"') {
        // A `LocalizedStringKey` position: a `String` variable there would render verbatim.
        if (/(?<![\w.])(?:Label|TextField|SecureField)\($/.test(own.slice(Math.max(0, start - 13), start))) continue;
        marker = "S";
      } else if (t === "Color.markswift(") {
        for (let depth = 1; depth > 0 && end < own.length; end++)
          depth += own[end] === "(" ? 1 : own[end] === ")" ? -1 : 0;
        token.lastIndex = end;
        marker = "C";
      } else if (t.startsWith("Palette.")) marker = "C";
      else if (t.startsWith("MarkswiftShape_")) marker = "I";
      else marker = (t[0] === "$" ? "$" : "") + kinds.get(strip(t))!;
      shape += own.slice(last, start) + `\u0001${marker}\u0001`;
      last = end;
      slots.push({ start, end, marker, value: own.slice(start, end) });
    }
    shape += own.slice(last);
    const kids = children.map(build);
    // A child spliced into a line instead of standing on its own cannot be re-expanded: never equal.
    const whole = own
      .split("\n")
      .filter((l) => l.includes("\u0000"))
      .every((l) => PLACEHOLDER.test(l));
    const full = whole ? `${n.kind}{${shape}}[${kids.map((k) => k.key).join("|")}]` : `!${opaque++}`;
    let key = interned.get(full);
    if (key === undefined) interned.set(full, (key = `#${interned.size}`));
    const t: NodeTemplate = { own, children, slots, key };
    out.set(n, t);
    return t;
  };
  build(root);
  return out;
}

/** Outermost runs of key-equal adjacent siblings (containers, or leaves that can be a `ForEach`), in document order. */
function findRuns(root: SemNode, templates: Map<SemNode, NodeTemplate>): Run[] {
  const tpl = (n: SemNode) => templates.get(n)!;
  // Member name → nodes whose own Swift references it.
  const refs = new Map<string, SemNode[]>();
  for (const [n, t] of templates)
    for (const s of t.slots) if (!LITERAL[s.marker]) refs.set(strip(s.value), [...(refs.get(strip(s.value)) ?? []), n]);
  const collect = (n: SemNode, out: SemNode[] = []): SemNode[] => {
    out.push(n);
    for (const c of tpl(n).children) collect(c, out);
    return out;
  };
  const makeRun = (parent: StackNode | GridNode, start: number, members: SemNode[]): Run | undefined => {
    if (tpl(parent).children.some((c, i, all) => members.includes(c) && all.indexOf(c) !== i)) return undefined;
    const subtrees = members.map((m) => new Set(collect(m)));
    // Open state stays on the screen; conditional content references it through row bindings.
    const flats = members.map((m) => collect(m).flatMap((n) => tpl(n).slots.map((s) => ({ s, n }))));
    const columns = flats[0]!.map(({ s, n }, c) => {
      const own = tpl(n).own;
      return {
        marker: s.marker,
        values: flats.map((f) => f[c]!.s.value),
        nodes: flats.map((f) => f[c]!.n),
        at: own.slice(own.lastIndexOf("\n", s.start - 1) + 1, s.start),
      };
    });
    const vectors = columns.map((c) => c.values.map(strip).join("\u0000"));
    const cls = vectors.map((v) => vectors.indexOf(v));
    const roles: Role[] = [];
    // Member name → its column class, per member: one name in two classes cannot become one parameter.
    const classOf = members.map(() => new Map<string, number>());
    for (const [c, col] of columns.entries()) {
      const varying = col.values.some((v) => strip(v) !== strip(col.values[0]!));
      const kind = strip(col.marker);
      // Decided per type, over every member of the runs sharing it (`extractComponents`).
      if (LITERAL[kind]) {
        roles.push("literal");
        continue;
      }
      for (const [i, v] of col.values.entries()) {
        if ((classOf[i]!.get(strip(v)) ?? cls[c]) !== cls[c]) return undefined;
        classOf[i]!.set(strip(v), cls[c]!);
      }
      if (kind.startsWith("open:")) {
        roles.push("binding");
        continue;
      }
      // A member's own state, action or press must live only inside that member to move into its row.
      if (varying && col.values.some((v, i) => refs.get(strip(v))!.some((n) => !subtrees[i]!.has(n)))) return undefined;
      // Different handlers in the design (`save()`, `cancel()`) are different actions, not one per row.
      if (
        kind === "action" &&
        col.values.some((v) => stem(v) !== stem(col.values[0]!)) &&
        col.nodes.every((x) => x.action && !/^(?:node:|#)/.test(x.action.key))
      )
        return undefined;
      if (kind === "action") roles.push(varying ? "collapse" : "pass");
      else if (kind.startsWith("value")) roles.push(varying ? "field" : "binding");
      else if (varying) roles.push("move");
      else return undefined;
    }
    const n = parent;
    const forEach =
      n.kind === "stack" &&
      !n.measured &&
      !n.wrap &&
      typeof n.spacing === "number" &&
      !n.autoGaps?.length &&
      n.distribution !== "between" &&
      n.distribution !== "around" &&
      n.distribution !== "evenly" &&
      !(start === 0 && n.leadInset !== 0);
    // ponytail: runs whose state/action columns play different roles (a field in one, a constant in another) get separate types; merge per column if designs need it.
    const sig = `${tpl(members[0]!).key}|${columns.map((col, c) => (LITERAL[col.marker] ? "" : `${roles[c]}:${cls[c]}`)).join(",")}`;
    return { parent, members, columns, cls, roles, forEach, sig };
  };
  const runs: Run[] = [];
  const walk = (n: SemNode): void => {
    const first = new Map<SemNode, Run>();
    const inRun = new Set<SemNode>();
    if (isContainer(n))
      for (let i = 0; i < n.children.length; ) {
        const k = n.children[i]!;
        let j = i + 1;
        while (j < n.children.length && tpl(n.children[j]!).key === tpl(k).key) j++;
        const run = j - i >= 2 ? makeRun(n, i, n.children.slice(i, j)) : undefined;
        // ponytail: leaf runs only as a `ForEach` and only when their colours agree: per-member calls of a
        // one-node subview save nothing, and differently coloured neighbours (a name and its role) are not a list.
        const sameColours = run?.columns.every(
          (col) => col.marker !== "C" || col.values.every((v) => v === col.values[0]),
        );
        if (run && (isContainer(k) || (run.forEach && sameColours))) {
          first.set(k, run);
          for (const m of run.members) inRun.add(m);
        }
        i = j;
      }
    // ponytail: outermost runs only; repeats inside a member stay unrolled inside its subview.
    for (const c of new Set(tpl(n).children)) {
      const run = first.get(c);
      if (run) runs.push(run);
      else if (!inRun.has(c)) walk(c);
    }
  };
  walk(root);
  return runs;
}

const RESERVED_TYPES: Readonly<Record<string, true>> = Object.fromEntries(
  (
    "View Text Image Color Shape AnyShape Button Link Label Toggle Picker Slider Stepper TextField SecureField " +
    "TextEditor DatePicker ColorPicker ProgressView Gauge Menu List Section Form Group Grid GridRow Table ScrollView " +
    "NavigationView NavigationStack HStack VStack ZStack LazyVStack LazyHStack ForEach Spacer Divider Circle Rectangle " +
    "RoundedRectangle Capsule Ellipse Path Font Edge Alignment Animation Binding State Environment Data String Int " +
    "Double Float Bool Date URL UUID Array Set Dictionary Optional Result Error Never Character Identifiable Hashable " +
    "Palette BundledFonts"
  )
    .split(" ")
    .map((n) => [n, true]),
);
/** Member names that need a suffix: Swift keywords plus the row's `id` and a view's `body`. */
const RESERVED_MEMBERS: Readonly<Record<string, true>> = Object.fromEntries(
  (
    "associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private " +
    "protocol public rethrows static struct subscript typealias var break case catch continue default defer do else " +
    "fallthrough for guard if in repeat return throw switch where while as false is nil self super throws true try " +
    "any some id body"
  )
    .split(" ")
    .map((n) => [n, true]),
);
/** A bound control's field name by what it holds. */
const CONTROL_FIELDS: Readonly<Record<string, string>> = {
  toggle: "isOn",
  radio: "isSelected",
  radioGroup: "selection",
  textField: "text",
  secureField: "text",
  textEditor: "text",
  picker: "selection",
  slider: "value",
  stepper: "value",
  datePicker: "date",
  colorPicker: "color",
  disclosure: "isExpanded",
};
const COLOR_ROLES: Readonly<Record<string, string>> = {
  background: "backgroundColor",
  foregroundStyle: "foregroundColor",
  fill: "fillColor",
  strokeBorder: "borderColor",
  stroke: "borderColor",
  shadow: "shadowColor",
};

/** Design words as an UpperCamel Swift identifier; "" when none survive or it would start with a digit. */
const ident = (s: string) => {
  const p = pascalWords(s);
  return /^[A-Z]/.test(p) ? p : "";
};
const lowerFirst = (s: string) => s[0]!.toLowerCase() + s.slice(1);

/** Names of one row type: `<base>`, `<base>View`, its closure variable, fields and pass-through bindings by column. */
interface TypeNames {
  type: string;
  view: string;
  row: string;
  fields: Map<number, string>;
  pass: Map<number, string>;
  /** The subview's row-index parameter of a counter marker (`ordinal`). */
  ordinal?: string;
}

/**
 * Every name extraction mints, from the markup (`nameHint`, `field`) and nearby headings; never from
 * paths. Types/arrays share one record with the screen's own members; fields are per type.
 */
export function componentNames(
  screen: Screen,
  viewName: string,
  ctx: EmitContext,
  types: Array<{ run: Run; group: Run[]; fieldCols: number[]; counter?: CounterColumn }>,
  runType: number[],
  screenFields: SemNode[],
): { types: TypeNames[]; data: string[]; fields: Map<SemNode, string>; actions: Map<Run, Map<number, string>> } {
  const seen: Record<string, number> = { body: 1 };
  for (const m of ctx.control.members) seen[m.name] = 1;
  for (const name of ctx.nameOf.values()) seen[name] = 1;
  for (const name of ctx.scaledFonts?.keys() ?? []) seen[name] = 1;
  const unique = (base: string) => {
    let name = base;
    for (let k = 2; seen[name]; k++) name = `${base}${k}`;
    seen[name] = 1;
    return name;
  };
  const controlOf = new Map<string, SemNode>();
  for (const [n, name] of ctx.control.stateOf) if (!controlOf.has(name)) controlOf.set(name, n);
  /** The node a slot column names itself after: a binding's control, else the slot's own node. */
  const nodeAt = (run: Run, c: number, i: number) => {
    const col = run.columns[c]!;
    return LITERAL[strip(col.marker)] ? col.nodes[i] : controlOf.get(strip(col.values[i]!));
  };
  /** Rule 3: a name by what the slot holds. */
  const kindName = (run: Run, c: number) => {
    const col = run.columns[c]!;
    const kind = strip(col.marker);
    const n = nodeAt(run, c, 0);
    if (kind === "S") return n?.a11y?.heading ? "title" : "text";
    if (kind === "I") return "icon";
    if (kind === "C") {
      // The innermost call still open before the slot on its line.
      let i = col.at.length - 1;
      for (let depth = 0; i >= 0; i--) {
        if (col.at[i] === ")") depth++;
        else if (col.at[i] === "(" && depth-- === 0) break;
      }
      return COLOR_ROLES[/(\w*)$/.exec(col.at.slice(0, Math.max(i, 0)))![1]!] ?? "color";
    }
    // An ARIA toggle drawn as a Button holds what a native checkbox or radio group would.
    if (n && ctx.control.toggleOf.has(n)) return n.a11y?.group !== undefined ? "selection" : "isOn";
    if (n?.kind !== "control") return "value";
    if (n.files) return "isPresented";
    return CONTROL_FIELDS[n.control === "radio" && n.group !== undefined ? "radioGroup" : n.control] ?? "value";
  };
  /** Rules 1–2: `data-markswift-field`, else a component/slot/class hint every node agrees on minus the type's leading words. */
  const fieldName = (nodes: Array<SemNode | undefined>, fallback: string, own: Record<string, number>, base = "") => {
    const n = nodes[0];
    let words = n?.field ?? "";
    const hint = n?.nameHint;
    if (
      !words &&
      hint &&
      (hint.source === "component" || hint.source === "slot" || hint.source === "class") &&
      nodes.every((x) => x?.nameHint?.words === hint.words)
    ) {
      const parts = ident(hint.words).split(/(?=[A-Z])/);
      const lead = base.split(/(?=[A-Z])/);
      let k = 0;
      while (k < lead.length && parts[k] === lead[k]) k++;
      words = parts.slice(k).join(" ");
    }
    const raw = ident(words) || ident(fallback);
    return memberName("", RESERVED_MEMBERS[lowerFirst(raw)] ? `${raw} value` : raw, own, fallback);
  };

  const out: TypeNames[] = [];
  const bases: string[] = [];
  /** Per run, each collapsed action class's screen member name. */
  const actions = new Map<Run, Map<number, string>>();
  for (const t of types) {
    const m = t.run.members[0]!;
    const hint = m.nameHint;
    const members = t.group.flatMap((r) => r.members);
    let base =
      hint && hint.source !== "tag" && members.every((x) => x.nameHint?.words === hint.words) ? ident(hint.words) : "";
    if (!base) {
      const noun = (hint?.source === "tag" && ident(hint.words)) || "Item";
      const heading = headingNear(screen, t.run);
      base = (heading && ident(`${heading.split(/\s+/).slice(0, 3).join(" ")} ${noun}`)) || noun;
    }
    if (RESERVED_TYPES[base] || RESERVED_TYPES[`${base}View`] || base === viewName) base += "Item";
    bases.push(base);
    const type = unique(base);
    seen[`${type}View`] = 1;
    const own: Record<string, number> = {};
    const fields = new Map<number, string>();
    // A node's markup names its first field (a text's string, a control's value); its others go by kind.
    const named = new Set<SemNode | undefined>();
    for (const c of t.fieldCols) {
      const nodes = t.group.flatMap((r) => r.members.map((_, i) => nodeAt(r, c, i)));
      fields.set(c, fieldName(named.has(nodes[0]) ? [] : nodes, kindName(t.run, c), own, base));
      named.add(nodes[0]);
    }
    // A per-row action keeps its members' shared name (`onEdit`, `onEdit2` → `onEdit`); members named
    // after their own captions (`onApples`, `onPears`) name it after the row (`onItem`).
    for (const run of t.group) {
      const named = new Map<number, string>();
      run.roles.forEach((r, c) => {
        if (r !== "collapse" || run.cls[c] !== c) return;
        const values = run.columns[c]!.values;
        named.set(c, values.every((v) => stem(v) === stem(values[0]!)) ? strip(values[0]!) : unique(`on${type}`));
      });
      actions.set(run, named);
    }
    // Subview parameters: the row, actions and moved members keep their names; screen bindings handed through get field-like ones.
    const row = unique(lowerFirst(type));
    const params: Record<string, number> = { [row]: 1, body: 1 };
    t.run.roles.forEach((r, c) => {
      if (r === "pass" || r === "move") params[strip(t.run.columns[c]!.values[0]!)] = 1;
      if (r === "collapse") params[actions.get(t.run)!.get(t.run.cls[c]!)!] = 1;
    });
    let ordinal: string | undefined;
    if (t.counter) {
      ordinal = "ordinal";
      for (let k = 2; params[ordinal]; k++) ordinal = `ordinal${k}`;
      params[ordinal] = 1;
    }
    const pass = new Map<number, string>();
    t.run.roles.forEach((r, c) => {
      if (r === "binding" && t.run.cls[c] === c)
        pass.set(c, fieldName([nodeAt(t.run, c, 0)], kindName(t.run, c), params));
    });
    out.push({ type, view: `${type}View`, row, fields, pass, ...(ordinal ? { ordinal } : {}) });
  }
  const data = runType.map((t) => {
    const b = lowerFirst(bases[t]!);
    return unique(/[^aeiou]y$/i.test(b) ? `${b.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(b) ? `${b}es` : `${b}s`);
  });
  const fields = new Map(screenFields.map((n) => [n, fieldName([n], "value", seen)]));
  return { types: out, data, fields, actions };
}

/** The type's naming heading: nearest preceding, then following, siblings of the run, then one level up at a time. */
function headingNear(screen: Screen, run: Run): string | undefined {
  const kids = (n: SemNode): SemNode[] => [
    ...(n.kind === "stack" || n.kind === "grid" ? n.children : []),
    ...(n.kind === "control" ? [...(n.label ? [n.label] : []), ...n.content] : []),
    ...n.overlays.map((o) => o.node),
  ];
  const parentOf = new Map<SemNode, SemNode>();
  visit(screen.root, (n) => {
    for (const c of kids(n)) parentOf.set(c, n);
  });
  const headingIn = (n: SemNode): string | undefined => {
    if (n.kind === "text" && n.a11y?.heading) {
      const text = n.runs
        .filter((r) => !r.image)
        .map((r) => r.text)
        .join("")
        .trim();
      if (text) return text;
    }
    for (const c of kids(n)) {
      const h = headingIn(c);
      if (h) return h;
    }
    return undefined;
  };
  let inner: SemNode[] = run.members;
  for (let p: SemNode | undefined = run.parent; p; inner = [p], p = parentOf.get(p)) {
    const all = kids(p);
    const near = [...all.slice(0, all.indexOf(inner[0]!)).reverse(), ...all.slice(all.indexOf(inner.at(-1)!) + 1)];
    for (const s of near) {
      const h = headingIn(s);
      if (h) return h;
    }
  }
  return undefined;
}

/** An `init` parameter of the screen: a stored property with its design default (`state`: seeds a private `@State`). */
export interface Param {
  name: string;
  type: string;
  value: string;
  state?: true;
}
/** A screen member: leading lines (docs, private decls), then the stored property behind `param`, if any. */
export interface ScreenMember {
  decl: string[];
  param?: Param;
}

/** `public ` for a generated library's API, nothing for app output. */
export const access = (v: EmitOptions["visibility"]) => (v === "public" ? "public " : "");

/** A control member as a screen member: an action callback is an `init` parameter, an open state an `init`-seeded `@State`. */
export function asMember(m: ControlMembers["members"][number]): ScreenMember {
  if (m.kind === "open") return { decl: [], param: { name: m.name, type: m.type, value: m.seed!, state: true } };
  return m.kind === "action"
    ? { decl: m.decl.slice(0, -1), param: { name: m.name, type: m.type, value: "{}" } }
    : { decl: m.decl };
}

/**
 * Repeated sibling elements of an app-mode screen as nested row types, data arrays and subviews,
 * plus the screen's `data-markswift-field` texts and controls as `init` parameters; undefined when
 * the screen has neither. Strict equality: optional children, variants and `:last-child` edges
 * break a run; grids and measured, wrapping or distributed stacks get
 * the shared subview called once per member (`Self.<array>[i]`, not a parameter) instead of a `ForEach`.
 */
export function extractComponents(
  screen: Screen,
  ctx: EmitContext,
  viewName: string,
  opts: Pick<EmitOptions, "visibility" | "registerFonts">,
): Extraction | undefined {
  if (ctx.mode !== "app") return undefined;
  const acc = access(opts.visibility);
  const templates = nodeTemplates(screen.root, ctx);
  const runs = findRuns(screen.root, templates);
  const tpl = (n: SemNode) => templates.get(n)!;
  const memberOf = new Map(ctx.control.members.map((m) => [m.name, m]));
  /** A control state's design seed (its `@State` initial value). */
  const seed = (name: string) => {
    const member = memberOf.get(name)!;
    if (member.seed !== undefined) return member.seed;
    const decl = member.decl.at(-1)!;
    return decl.slice(decl.indexOf(" = ") + 3);
  };

  interface Type {
    index: number;
    /** The first run: its first member is the subview's code, its member names the parameter labels. */
    run: Run;
    group: Run[];
    /** Field columns (one per class), in DFS order. */
    fieldCols: number[];
    binding: boolean;
    /** A counter marker column derived from the row index (one per type, never with binding rows). */
    counter?: CounterColumn;
  }
  // Runs with equal signatures share a type. One subview renders all of them, so a design literal
  // is a field when it differs anywhere across their members, and literal only when all agree.
  const groups = new Map<string, Run[]>();
  for (const run of runs) groups.set(run.sig, [...(groups.get(run.sig) ?? []), run]);
  const types: Type[] = [];
  for (const group of groups.values()) {
    const head = group[0]!;
    const vectors = head.columns.map((col, c) =>
      LITERAL[col.marker] ? group.flatMap((run) => run.columns[c]!.values).join("\u0000") : undefined,
    );
    for (const [c, v] of vectors.entries()) {
      if (v === undefined) continue;
      const first = head.columns[c]!.values[0]!;
      const role = group.some((run) => run.columns[c]!.values.some((x) => x !== first)) ? "field" : "literal";
      for (const run of group) {
        run.roles[c] = role;
        run.cls[c] = vectors.indexOf(v);
      }
    }
    // A string column of counter markers (`1. `, `IV. `) in an arithmetic progression: the row index renders it, so
    // rows passed in number themselves. Binding rows keep their strings.
    let counter: CounterColumn | undefined;
    if (!head.roles.some((r, c) => r === "field" && !LITERAL[strip(head.columns[c]!.marker)]))
      for (const [c, col] of head.columns.entries()) {
        if (col.marker !== "S" || head.roles[c] !== "field" || head.cls[c] !== c) continue;
        counter = counterColumn(group, c);
        if (!counter) continue;
        for (const run of group)
          run.cls.forEach((k, x) => {
            if (k === c && run.columns[x]!.marker === "S") run.roles[x] = "counter";
          });
        break;
      }
    const fieldCols = head.roles.flatMap((r, c) => (r === "field" && head.cls[c] === c ? [c] : []));
    const binding = fieldCols.some((c) => !LITERAL[strip(head.columns[c]!.marker)]);
    types.push({ index: types.length, run: head, group, fieldCols, binding, ...(counter ? { counter } : {}) });
  }
  const runType = runs.map((run) => types.find((t) => t.group.includes(run))!);
  /** One column per class with `role`. */
  const classes = (run: Run, role: Role) => run.roles.flatMap((r, c) => (r === role && run.cls[c] === c ? [c] : []));
  /** Member name of column `c` (all members, for non-varying roles; the first member's otherwise). */
  const nameAt = (run: Run, c: number) => strip(run.columns[c]!.values[0]!);

  const absorbed = new Set<SemNode>();
  for (const run of runs) for (const m of run.members) visit(m, (n) => absorbed.add(n));
  const memberNodes = new Set(runs.flatMap((run) => run.members));
  // Annotated single instances: a text with one string, or a control's design state.
  const screenFields: SemNode[] = [];
  const claimed: Record<string, true> = {};
  visit(screen.root, (n) => {
    if (n.nameHint?.source === "component" && !memberNodes.has(n))
      note(
        n,
        "approximated",
        "@data-markswift-component",
        "data-markswift-component names repeated sibling elements; this element has no equal sibling, so it stays inline",
      );
    if (!n.field || absorbed.has(n)) return;
    const state = ctx.control.stateOf.get(n);
    if (n.kind === "text" && templates.get(n)?.slots.filter((s) => s.marker === "S").length === 1) screenFields.push(n);
    else if (state && memberOf.get(state)?.kind === "value") {
      if (!claimed[state]) screenFields.push(n);
      claimed[state] = true;
    } else
      note(
        n,
        "approximated",
        "@data-markswift-field",
        "data-markswift-field applies to text with one run or to a form control; ignored",
      );
  });
  if (!runs.length && !screenFields.length) return undefined;
  const names = componentNames(
    screen,
    viewName,
    ctx,
    types,
    runType.map((t) => t.index),
    screenFields,
  );
  /** Screen member name of a run's collapsed action class `c`. */
  const actionAt = (run: Run, c: number) => names.actions.get(run)!.get(c)!;

  /** `n`'s template with each slot from `slot` and each child placeholder from `child`. */
  const fill = (n: SemNode, slot: (s: Slot, i: number) => string, child: (c: SemNode) => string[]): string[] => {
    const { own, slots, children } = tpl(n);
    let text = "";
    let last = 0;
    for (const [i, s] of slots.entries()) {
      text += own.slice(last, s.start) + slot(s, i);
      last = s.end;
    }
    text += own.slice(last);
    return text.split("\n").flatMap((line) => {
      const m = PLACEHOLDER.exec(line);
      if (!m) return [line];
      return child(children[Number(m[2])]!).map((l) => (l ? m[1] + l : l));
    });
  };

  const calls = new Map<SemNode, string[]>();
  /** Screen member that moves into a run's rows → that run. */
  const removed = new Map<string, Run>();
  runs.forEach((run, r) => {
    const t = runType[r]!;
    const { view, row, pass, ordinal } = names.types[t.index]!;
    const data = names.data[r]!;
    for (const [c, role] of run.roles.entries())
      if ((role === "field" && !LITERAL[strip(run.columns[c]!.marker)]) || role === "collapse" || role === "move")
        for (const v of run.columns[c]!.values) removed.set(strip(v), run);
    const ord = t.counter?.ords.get(run);
    const args = (item: string, value: string, index = "") =>
      [
        `${row}: ${value}`,
        ...(ord ? [`${ordinal}: ${index}`] : []),
        ...classes(run, "binding").map((c) => {
          const values = run.columns[c]!.values.map(strip);
          const same = values.every((v) => v === values[0]);
          const binding = same
            ? `$${nameAt(run, c)}`
            : `([${values.map((v, i) => `${str(run.members[i]!.id)}: $${v}`).join(", ")}][${item}.id] ?? .constant(false))`;
          return `${pass.get(c)}: ${binding}`;
        }),
        ...classes(run, "pass").map((c) => `${nameAt(t.run, c)}: ${nameAt(run, c)}`),
        ...classes(run, "collapse").map((c) => `${actionAt(t.run, c)}: { ${actionAt(run, c)}(${item}) }`),
      ].join(", ");
    if (run.forEach && ord) {
      const { first, step } = ord;
      const index =
        step === 1
          ? first === 0
            ? "index"
            : `${first} + index`
          : step === -1
            ? `${first} - index`
            : `${first} + ${step} * index`;
      calls.set(run.members[0]!, [
        `ForEach(Array(${data}.enumerated()), id: \\.element.id) { index, ${row} in`,
        `    ${view}(${args(row, row, index)})`,
        "}",
      ]);
      for (const m of run.members.slice(1)) calls.set(m, []);
    } else if (run.forEach) {
      calls.set(
        run.members[0]!,
        t.binding
          ? [`ForEach($${data}) { $${row} in`, `    ${view}(${args(row, `$${row}`)})`, "}"]
          : [`ForEach(${data}) { ${row} in`, `    ${view}(${args(row, row)})`, "}"],
      );
      for (const m of run.members.slice(1)) calls.set(m, []);
    } else
      run.members.forEach((m, i) => {
        const item = t.binding ? `${data}[${i}]` : `Self.${data}[${i}]`;
        calls.set(m, [
          `${view}(${args(item, t.binding ? `$${item}` : item, ord ? String(ord.first + ord.step * i) : "")})`,
        ]);
      });
  });

  // Screen members in `init` order: ForEach data, annotated fields, then the controls' members
  // (a run's own state/actions/presses leave; its collapsed actions take the first one's place).
  const members: ScreenMember[] = [];
  runs.forEach((run, r) => {
    const t = runType[r]!;
    const data = names.data[r]!;
    const type = names.types[t.index]!.type;
    if (run.forEach)
      members.push({
        decl: [],
        param: { name: data, type: `[${type}]`, value: `Self.${data}`, ...(t.binding ? { state: true as const } : {}) },
      });
    else if (t.binding) members.push({ decl: [`@State private var ${data} = Self.${data}`] });
  });
  const rename: Record<string, string> = {};
  for (const n of screenFields) {
    const name = names.fields.get(n)!;
    const state = ctx.control.stateOf.get(n);
    if (state) {
      rename[state] = name;
      members.push({ decl: [], param: { name, type: memberOf.get(state)!.type, value: seed(state), state: true } });
    } else {
      const s = tpl(n).slots.find((x) => x.marker === "S")!;
      calls.set(
        n,
        fill(
          n,
          (x) => (x === s ? name : x.value),
          (c) => ctx.renderNode(c),
        ),
      );
      members.push({ decl: [], param: { name, type: "String", value: s.value } });
    }
  }
  const placed = new Set<Run>();
  for (const m of ctx.control.members) {
    if (rename[m.name]) continue;
    const run = removed.get(m.name);
    if (!run) members.push(asMember(m));
    else if (!placed.has(run)) {
      placed.add(run);
      const type = names.types[runType[runs.indexOf(run)]!.index]!.type;
      for (const c of classes(run, "collapse"))
        members.push({
          decl: memberOf.get(nameAt(run, c))!.decl.slice(0, -1),
          param: { name: actionAt(run, c), type: `(${type}) -> Void`, value: "{ _ in }" },
        });
    }
  }

  // Per type, in document order of its first run: the row struct, each run's data, the subview.
  const extension: string[] = [];
  const previews: string[] = [];
  for (const t of types) {
    const n = names.types[t.index]!;
    const head = t.run;
    const own = runs.flatMap((run, r) => (runType[r] === t ? [{ run, data: names.data[r]! }] : []));
    const fields = t.fieldCols.map((c) => {
      const kind = strip(head.columns[c]!.marker);
      const swiftType =
        kind === "S"
          ? "String"
          : kind === "C"
            ? "Color"
            : kind === "I"
              ? "AnyShape"
              : memberOf.get(nameAt(head, c))!.type;
      return { c, name: n.fields.get(c)!, type: swiftType };
    });
    if (extension.length) extension.push("");
    extension.push(
      `/// One row of \`${own[0]!.data}\`: the content that differs between the repeated elements of the design.`,
      `${acc}struct ${n.type}: Identifiable {`,
      "    /// Template path of the captured element: stable across regenerations of the same design.",
      `    ${acc}let id: String`,
      ...fields.map((f) => `    ${acc}var ${f.name}: ${f.type}`),
    );
    if (acc)
      extension.push(
        "",
        `    ${acc}init(${["id: String", ...fields.map((f) => `${f.name}: ${f.type}`)].join(", ")}) {`,
        ...["id", ...fields.map((f) => f.name)].map((f) => `        self.${f} = ${f}`),
        "    }",
      );
    extension.push("}");
    for (const { run, data } of own) {
      const ids = run.members.map((m) => m.id);
      const unique = new Set(ids).size === ids.length;
      extension.push("", `${acc}static let ${data}: [${n.type}] = [`);
      for (const [i, m] of run.members.entries()) {
        const values = fields.map(({ c, name }) => {
          const col = run.columns[c]!;
          const v = col.values[i]!;
          const kind = strip(col.marker);
          if (kind === "S" || kind === "C") return `${name}: ${v}`;
          if (kind === "I") return `${name}: AnyShape(${v})`;
          // A binding field starts at the member's `@State` seed.
          return `${name}: ${seed(strip(v))}`;
        });
        extension.push(`    ${n.type}(${[`id: ${str(unique ? m.id : String(i))}`, ...values].join(", ")}),`);
      }
      extension.push("]");
    }
    extension.push("", ...subview(t, n));
    const first = `${viewName}.${own[0]!.data}[0]`;
    const args = [
      `${n.row}: ${t.binding ? `$${n.row}` : first}`,
      ...(t.counter ? [`${n.ordinal}: ${t.counter.ords.get(head)!.first}`] : []),
      ...classes(head, "binding").map((c) => `${n.pass.get(c)}: .constant(${seed(nameAt(head, c))})`),
    ];
    if (previews.length) previews.push("");
    previews.push(
      `#Preview("${viewName}.${n.view}") {`,
      ...indent(
        [
          ...(t.binding ? [`@Previewable @State var ${n.row} = ${first}`] : []),
          // `@Previewable` items must open the preview block, so registration follows them.
          ...(opts.registerFonts ? ["BundledFonts.register()"] : []),
          `${opts.registerFonts ? "return " : ""}${viewName}.${n.view}(${args.join(", ")})`,
          `.frame(width: ${num(head.members[0]!.frame.w)})`,
        ],
        1,
      ),
      "}",
    );
  }

  /** The subview: the type's first member as emitted, with every field slot reading from the row. */
  function subview(t: Type, n: TypeNames): string[] {
    const run = t.run;
    const first = run.members[0]!;
    // Column of each node's first slot, in the member's DFS slot order.
    const offset = new Map<SemNode, number>();
    let next = 0;
    const number = (node: SemNode) => {
      if (!offset.has(node)) offset.set(node, next);
      next += tpl(node).slots.length;
      for (const c of tpl(node).children) number(c);
    };
    number(first);
    const expand = (node: SemNode): string[] => {
      const base = offset.get(node)!;
      return fill(
        node,
        (s, i) => {
          const cls = run.cls[base + i]!;
          const dollar = s.value[0] === "$" ? "$" : "";
          const field = n.fields.get(cls);
          if (field) return `${dollar}${n.row}.${field}`;
          const role = run.roles[base + i];
          if (role === "collapse") return actionAt(run, cls);
          if (role === "counter") {
            const { style, prefix, suffix } = t.counter!.counter;
            return `${str(prefix).slice(0, -1)}\\(markswiftCounter(${n.ordinal}, .${SWIFT_COUNTER[style]}))${str(suffix).slice(1)}`;
          }
          const pass = role === "binding" ? n.pass.get(cls) : undefined;
          return pass ? dollar + pass : s.value;
        },
        (c) => (isContainer(c) ? [ctx.nameOf.get(c)!] : expand(c)),
      );
    };
    const body = [`${acc}var body: some View {`, ...indent(expand(first), 1), "}"];
    // A breakpoint row holding a band holder reads the band `MarkswiftBands` chose from the environment.
    let banded = false;
    visit(first, (node) => {
      banded ||= !!node.alternatives;
      if (node !== first && isContainer(node))
        body.push(
          "",
          `// ${node.id.replace(/[\r\n\u2028\u2029]/g, " ")}`,
          `private var ${ctx.nameOf.get(node)!}: some View {`,
          ...indent(expand(node), 1),
          "}",
        );
    });
    const text = body.join("\n");
    const scaled = [...(ctx.scaledFonts ?? [])]
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(text))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, decl]) => decl);
    const bindings = classes(run, "binding").map((c) => ({
      name: n.pass.get(c)!,
      type: memberOf.get(nameAt(run, c))!.type,
    }));
    const actions = [
      ...classes(run, "pass").map((c) => nameAt(run, c)),
      ...classes(run, "collapse").map((c) => actionAt(run, c)),
    ];
    const init = acc
      ? [
          `${acc}init(${[
            `${n.row}: ${t.binding ? `Binding<${n.type}>` : n.type}`,
            ...(n.ordinal ? [`${n.ordinal}: Int`] : []),
            ...bindings.map((b) => `${b.name}: Binding<${b.type}>`),
            ...actions.map((a) => `${a}: @escaping () -> Void = {}`),
          ].join(", ")}) {`,
          `    ${t.binding ? "_" : "self."}${n.row} = ${n.row}`,
          ...(n.ordinal ? [`    self.${n.ordinal} = ${n.ordinal}`] : []),
          ...bindings.map((b) => `    _${b.name} = ${b.name}`),
          ...actions.map((a) => `    self.${a} = ${a}`),
          "}",
          "",
        ]
      : [];
    const members = [
      ...(banded ? ["@Environment(\\.markswiftBand) private var band"] : []),
      ...scaled,
      t.binding ? `@Binding ${acc}var ${n.row}: ${n.type}` : `${acc}let ${n.row}: ${n.type}`,
      ...(n.ordinal ? [`${acc}let ${n.ordinal}: Int`] : []),
      ...bindings.map((b) => `@Binding ${acc}var ${b.name}: ${b.type}`),
      ...actions.map((a) => `${acc}var ${a}: () -> Void = {}`),
      ...classes(run, "move").flatMap((c) => memberOf.get(nameAt(run, c))!.decl),
      "",
      ...init,
      ...body,
    ];
    return [`${acc}struct ${n.view}: View {`, ...indent(members, 1), "}"];
  }

  return { call: (n) => calls.get(n), absorbed, members, rename, extension, previews };
}
