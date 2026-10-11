/**
 * Repeated siblings → one nested subview plus a static data array iterated with `ForEach` (app
 * mode). The emitter is the equality test: every node is emitted once with a placeholder line per
 * child it asks `ctx.renderNode` for, and siblings whose emitted Swift differs only in design
 * literals (strings, colours, shapes, control state/action names) form a run. The subview is the
 * first member's own emitted code with the differing literals read from `row`, so the pixels are
 * the unrolled view's by construction.
 */
import type { GridNode, Screen, SemNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, str } from "./format.ts";
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
 * `move`: per-row pressed/focused state declared in the subview.
 */
type Role = "field" | "literal" | "binding" | "pass" | "collapse" | "move";

interface Run {
  parent: StackNode | GridNode;
  members: SemNode[];
  /** Per slot column (DFS order over a member): marker and each member's value. */
  columns: Array<{ marker: string; values: string[] }>;
  /** First column whose value vector equals this one's (`$` stripped): columns sharing one field or parameter. */
  cls: number[];
  roles: Role[];
  forEach: boolean;
  /** Runs with equal signatures share one row type and subview. */
  sig: string;
}

export interface Extraction {
  /** Lines for a run member, undefined for any other node. */
  call(node: SemNode): string[] | undefined;
  /** Every node inside a run member (all members). */
  absorbed: Set<SemNode>;
  /** The screen's member declarations replacing `ctx.control.decls`. */
  decls: string[];
  /** `extension <View> { … }` body lines. */
  extension: string[];
}

/** Every name extraction mints. Placeholders: plan 031 replaces them here and nowhere else. */
export function componentNames() {
  const counted = (base: string, i: number) => (i === 0 ? base : `${base}${i + 1}`);
  return {
    row: "row",
    type: (i: number) => counted("Row", i),
    view: (i: number) => `${counted("Row", i)}View`,
    data: (i: number) => counted("rows", i),
    /** Field of a slot kind; repeats in one type count up (`text`, `text2`). */
    field: (marker: string, seen: Record<string, number>) => {
      const kind = strip(marker);
      const base =
        kind === "S"
          ? "text"
          : kind === "C"
            ? "color"
            : kind === "I"
              ? "icon"
              : kind === "value:Bool"
                ? "isOn"
                : "value";
      seen[base] = (seen[base] ?? 0) + 1;
      return counted(base, seen[base] - 1);
    },
  };
}

const isContainer = (n: SemNode): n is StackNode | GridNode => n.kind === "stack" || n.kind === "grid";
const strip = (v: string) => v.replace(/^\$/, "");
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

/** Outermost runs of key-equal adjacent container siblings, in document order. */
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
    const flats = members.map((m) => collect(m).flatMap((n) => tpl(n).slots));
    const columns = flats[0]!.map((s, c) => ({ marker: s.marker, values: flats.map((f) => f[c]!.value) }));
    const vectors = columns.map((c) => c.values.map(strip).join("\u0000"));
    const cls = vectors.map((v) => vectors.indexOf(v));
    const roles: Role[] = [];
    // Member name → its column class, per member: one name in two classes cannot become one parameter.
    const classOf = members.map(() => new Map<string, number>());
    for (const [c, col] of columns.entries()) {
      const varying = col.values.some((v) => strip(v) !== strip(col.values[0]!));
      const kind = strip(col.marker);
      if (LITERAL[kind]) {
        roles.push(varying ? "field" : "literal");
        continue;
      }
      for (const [i, v] of col.values.entries()) {
        if ((classOf[i]!.get(strip(v)) ?? cls[c]) !== cls[c]) return undefined;
        classOf[i]!.set(strip(v), cls[c]!);
      }
      // A member's own state, action or press must live only inside that member to move into its row.
      if (varying && col.values.some((v, i) => refs.get(strip(v))!.some((n) => !subtrees[i]!.has(n)))) return undefined;
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
    // ponytail: runs whose columns play different roles (a field in one, a constant in another) get separate types; merge per column if designs need it.
    const sig = `${tpl(members[0]!).key}|${roles.join(",")}|${cls.join(",")}`;
    return { parent, members, columns, cls, roles, forEach, sig };
  };
  const runs: Run[] = [];
  const walk = (n: SemNode): void => {
    const first = new Map<SemNode, Run>();
    const inRun = new Set<SemNode>();
    // ponytail: members must be containers; leaf runs read worse as data, revisit if users ask.
    if (isContainer(n))
      for (let i = 0; i < n.children.length; ) {
        const k = n.children[i]!;
        let j = i + 1;
        if (isContainer(k)) while (j < n.children.length && tpl(n.children[j]!).key === tpl(k).key) j++;
        const run = j - i >= 2 ? makeRun(n, i, n.children.slice(i, j)) : undefined;
        if (run) {
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

/**
 * Repeated sibling containers of an app-mode screen as nested row types, data arrays and subviews;
 * undefined when the screen repeats nothing. Strict equality: optional children, variants and
 * `:last-child` edges break a run (post-1.0 "loose extraction"); grids and measured, wrapping or
 * distributed stacks get the shared subview called once per member instead of a `ForEach`.
 */
export function extractComponents(screen: Screen, ctx: EmitContext): Extraction | undefined {
  if (ctx.mode !== "app") return undefined;
  const templates = nodeTemplates(screen.root, ctx);
  const runs = findRuns(screen.root, templates);
  if (!runs.length) return undefined;
  const names = componentNames();
  const tpl = (n: SemNode) => templates.get(n)!;
  const memberOf = new Map(ctx.control.members.map((m) => [m.name, m]));

  interface Type {
    index: number;
    /** The first run: its first member is the subview's code, its member names the parameter labels. */
    run: Run;
    /** Column class → field name. */
    fields: Map<number, string>;
    binding: boolean;
  }
  const types = new Map<string, Type>();
  const runType = runs.map((run) => {
    let t = types.get(run.sig);
    if (!t) {
      const seen: Record<string, number> = {};
      const fields = new Map<number, string>();
      for (const [c, r] of run.roles.entries())
        if (r === "field" && run.cls[c] === c) fields.set(c, names.field(run.columns[c]!.marker, seen));
      const binding = run.roles.some((r, c) => r === "field" && !LITERAL[strip(run.columns[c]!.marker)]);
      t = { index: types.size, run, fields, binding };
      types.set(run.sig, t);
    }
    return t;
  });
  /** One column per class with `role`. */
  const classes = (run: Run, role: Role) => run.roles.flatMap((r, c) => (r === role && run.cls[c] === c ? [c] : []));
  /** Member name of column `c` (all members, for non-varying roles; the first member's otherwise). */
  const nameAt = (run: Run, c: number) => strip(run.columns[c]!.values[0]!);

  const calls = new Map<SemNode, string[]>();
  const absorbed = new Set<SemNode>();
  /** Screen member that moves into a run's rows → that run. */
  const removed = new Map<string, Run>();
  runs.forEach((run, r) => {
    const t = runType[r]!;
    const view = names.view(t.index);
    const data = names.data(r);
    for (const m of run.members) visit(m, (n) => absorbed.add(n));
    for (const [c, role] of run.roles.entries())
      if ((role === "field" && !LITERAL[strip(run.columns[c]!.marker)]) || role === "collapse" || role === "move")
        for (const v of run.columns[c]!.values) removed.set(strip(v), run);
    const args = (row: string, value: string) =>
      [
        `${names.row}: ${value}`,
        ...classes(run, "binding").map((c) => `${nameAt(t.run, c)}: $${nameAt(run, c)}`),
        ...classes(run, "pass").map((c) => `${nameAt(t.run, c)}: ${nameAt(run, c)}`),
        ...classes(run, "collapse").map((c) => `${nameAt(t.run, c)}: { ${nameAt(run, c)}(${row}) }`),
      ].join(", ");
    if (run.forEach) {
      const row = names.row;
      calls.set(
        run.members[0]!,
        t.binding
          ? [`ForEach($${data}) { $${row} in`, `    ${view}(${args(row, `$${row}`)})`, "}"]
          : [`ForEach(Self.${data}) { ${row} in`, `    ${view}(${args(row, row)})`, "}"],
      );
      for (const m of run.members.slice(1)) calls.set(m, []);
    } else
      run.members.forEach((m, i) => {
        const row = t.binding ? `${data}[${i}]` : `Self.${data}[${i}]`;
        calls.set(m, [`${view}(${args(row, t.binding ? `$${row}` : row)})`]);
      });
  });

  // Screen members: a run's own state/actions/presses leave; its rows state and collapsed actions
  // take the place of the first one that left.
  const decls: string[] = [];
  const placed = new Set<Run>();
  for (const m of ctx.control.members) {
    const run = removed.get(m.name);
    if (!run) decls.push(...m.decl);
    else if (!placed.has(run)) {
      placed.add(run);
      const r = runs.indexOf(run);
      const t = runType[r]!;
      if (t.binding) decls.push(`@State private var ${names.data(r)} = Self.${names.data(r)}`);
      for (const c of classes(run, "collapse"))
        decls.push(
          ...memberOf.get(nameAt(run, c))!.decl.slice(0, -1),
          `var ${nameAt(run, c)}: (${names.type(t.index)}) -> Void = { _ in }`,
        );
    }
  }

  // Per type, in document order of its first run: the row struct, each run's data, the subview.
  const extension: string[] = [];
  for (const t of types.values()) {
    const type = names.type(t.index);
    const head = t.run;
    const own = runs.flatMap((run, r) => (runType[r] === t ? [{ run, data: names.data(r) }] : []));
    if (extension.length) extension.push("");
    extension.push(
      `/// One row of \`${own[0]!.data}\`: the content that differs between the repeated elements of the design.`,
      `struct ${type}: Identifiable {`,
      "    /// Template path of the captured element: stable across regenerations of the same design.",
      "    let id: String",
    );
    for (const [c, f] of t.fields) {
      const kind = strip(head.columns[c]!.marker);
      const swiftType =
        kind === "S"
          ? "String"
          : kind === "C"
            ? "Color"
            : kind === "I"
              ? "AnyShape"
              : memberOf.get(nameAt(head, c))!.type;
      extension.push(`    var ${f}: ${swiftType}`);
    }
    extension.push("}");
    for (const { run, data } of own) {
      const ids = run.members.map((m) => m.id);
      const unique = new Set(ids).size === ids.length;
      extension.push("", `static let ${data}: [${type}] = [`);
      for (const [i, m] of run.members.entries()) {
        const values = [...t.fields].map(([c, f]) => {
          const col = run.columns[c]!;
          const v = col.values[i]!;
          const kind = strip(col.marker);
          if (kind === "S" || kind === "C") return `${f}: ${v}`;
          if (kind === "I") return `${f}: AnyShape(${v})`;
          // A binding field starts at the member's `@State` seed.
          const decl = memberOf.get(strip(v))!.decl.at(-1)!;
          return `${f}: ${decl.slice(decl.indexOf(" = ") + 3)}`;
        });
        extension.push(`    ${type}(${[`id: ${str(unique ? m.id : String(i))}`, ...values].join(", ")}),`);
      }
      extension.push("]");
    }
    extension.push("", ...subview(t, type));
  }

  /** The subview: the type's first member as emitted, with every field slot reading from `row`. */
  function subview(t: Type, type: string): string[] {
    const run = t.run;
    const first = run.members[0]!;
    // Column of each node's first slot, in the member's DFS slot order.
    const offset = new Map<SemNode, number>();
    let next = 0;
    const number = (n: SemNode) => {
      if (!offset.has(n)) offset.set(n, next);
      next += tpl(n).slots.length;
      for (const c of tpl(n).children) number(c);
    };
    number(first);
    const expand = (n: SemNode): string[] => {
      const { own, slots, children } = tpl(n);
      const base = offset.get(n)!;
      let text = "";
      let last = 0;
      for (const [i, s] of slots.entries()) {
        const field = t.fields.get(run.cls[base + i]!);
        text += own.slice(last, s.start) + (field ? `${s.value[0] === "$" ? "$" : ""}${names.row}.${field}` : s.value);
        last = s.end;
      }
      text += own.slice(last);
      return text.split("\n").flatMap((line) => {
        const m = PLACEHOLDER.exec(line);
        if (!m) return [line];
        const c = children[Number(m[2])]!;
        return (isContainer(c) ? [ctx.nameOf.get(c)!] : expand(c)).map((l) => (l ? m[1] + l : l));
      });
    };
    const body = ["var body: some View {", ...indent(expand(first), 1), "}"];
    visit(first, (n) => {
      if (n !== first && isContainer(n))
        body.push(
          "",
          `// ${n.id.replace(/[\r\n\u2028\u2029]/g, " ")}`,
          `private var ${ctx.nameOf.get(n)!}: some View {`,
          ...indent(expand(n), 1),
          "}",
        );
    });
    const text = body.join("\n");
    const scaled = [...(ctx.scaledFonts ?? [])]
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(text))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, decl]) => decl);
    const members = [
      ...scaled,
      t.binding ? `@Binding var ${names.row}: ${type}` : `let ${names.row}: ${type}`,
      ...classes(run, "binding").map((c) => `@Binding var ${nameAt(run, c)}: ${memberOf.get(nameAt(run, c))!.type}`),
      ...classes(run, "pass").map((c) => `var ${nameAt(run, c)}: () -> Void = {}`),
      ...classes(run, "collapse").map((c) => `var ${nameAt(run, c)}: () -> Void = {}`),
      ...classes(run, "move").flatMap((c) => memberOf.get(nameAt(run, c))!.decl),
      "",
      ...body,
    ];
    return [`struct ${names.view(t.index)}: View {`, ...indent(members, 1), "}"];
  }

  return { call: (n) => calls.get(n), absorbed, decls, extension };
}
