import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { CONTEXT, DROPDOWN, SELECT } from "../../helpers/presentations.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const compile = (d: LayoutDoc, mode: "app" | "fidelity" = "app") => compileLayout(d, { name: "Overlay", mode });
const without = (d: LayoutDoc) => {
  const copy = structuredClone(d);
  delete copy.layers;
  return copy;
};

test("dropdown: the trigger's label opens a native Menu of the captured items; no trigger action, no @open", () => {
  const { code, openStates } = compile(DROPDOWN());
  for (const s of [
    "Menu {",
    "Button(action: onProfile) {",
    "Button(role: .destructive, action: onLogOut) {",
    "Toggle(isOn: $s_status) {",
    ".pickerStyle(.inline)",
    "Divider()",
    "Section {",
    "} label: {",
    ".menuStyle(.button)",
    ".menuIndicator(.hidden)",
    ".menuOrder(.fixed)",
  ])
    expect(code).toContain(s);
  expect(code).toContain('@State private var s_top: String = "Top"');
  expect(code).not.toContain("onOpen");
  expect(openStates).toBeUndefined();
  // The label is the Button's label: same lines, same style.
  const button = compile(without(DROPDOWN())).code;
  const label = (c: string, open: RegExp) => c.slice(c.search(open)).split("\n").slice(1, 7).join("\n");
  expect(label(code, /} label: \{\n +Text\(verbatim: "Open"\)/)).toBe(label(button, /Button\(action: onOpen\) \{/));
});

test("context menu: the trigger keeps its view and gains .contextMenu", () => {
  const lines = compile(CONTEXT()).code.split("\n");
  const at = lines.findIndex((l) => l.trim() === ".contextMenu {");
  expect(at).toBeGreaterThan(0);
  expect(lines.some((l) => l.trim() === "Menu {")).toBe(false);
  const indent = lines[at]!.indexOf(".");
  const end = lines.findIndex((l, i) => i > at && l === `${" ".repeat(indent)}}`);
  const body = (l: string[]) => l.slice(l.findIndex((x) => x.includes("var body"))).join("\n");
  expect(body([...lines.slice(0, at), ...lines.slice(end + 1)])).toBe(
    body(compile(without(CONTEXT())).code.split("\n")),
  );
});

test("select: the trigger's value text follows the Picker", () => {
  const { code } = compile(SELECT());
  expect(code).toContain('@State private var s_sl: String = "Banana"');
  expect(code).toMatch(/\} label: \{\n +HStack[^\n]*\n +Text\(verbatim: s_sl\)/);
});

test("fidelity ignores menus byte for byte", () => {
  for (const d of [DROPDOWN(), CONTEXT(), SELECT()])
    expect(compile(d, "fidelity").code).toBe(compile(without(d), "fidelity").code);
});

nativeTest(
  "generated menus typecheck",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-menu-views-"));
    try {
      for (const [i, d] of [DROPDOWN(), CONTEXT(), SELECT(), repeatedMenus()].entries()) {
        const out = join(directory, String(i));
        for (const [file, content] of Object.entries(compile(d).files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);

function repeatedMenus(): LayoutDoc {
  const d = DROPDOWN();
  d.root.styles["padding-top"] = "8px";
  const trigger = structuredClone(d.root.children[0]!);
  trigger.id = "second-menu-trigger";
  trigger.attrs.id = trigger.id;
  trigger.bounds.y += 48;
  d.root.children.push(trigger);
  const layer = structuredClone(d.layers![0]!);
  layer.id = "second-menu";
  layer.trigger = trigger.id;
  const rename = (n: typeof trigger): void => {
    if (n.id) n.id += "-second";
    n.children.forEach(rename);
  };
  layer.nodes.forEach(rename);
  d.layers!.push(layer);
  return d;
}

test("repeated native menus extract rows with independent toggle and picker values", () => {
  const code = compile(repeatedMenus()).code;
  expect(code).toContain("ForEach(");
  expect(code).toContain("Menu {");
  expect(code).toContain("@Binding var");
  expect(code).toContain("Toggle(isOn:");
  expect(code).toContain(".pickerStyle(.inline)");
});
