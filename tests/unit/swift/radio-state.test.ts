import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitSwift, SWIFT_RUNTIME } from "../../../src/swift/emit.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { expect, test } from "bun:test";
import type { ControlNode, SemBase, StackNode } from "../../../src/model/semantic.ts";
import { controlMembers } from "../../../src/swift/control-state.ts";
import { controlExpr } from "../../../src/swift/controls.ts";

function base(id: string): SemBase {
  return { id, frame: { x: 0, y: 0, w: 16, h: 16 }, width: { kind: "fixed", px: 16 }, height: { kind: "fixed", px: 16 }, padding: [0,0,0,0], style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [] };
}
function radio(group?: string, checked = false, disabled = false): ControlNode {
  return { ...base("duplicate"), kind: "control", control: "radio", value: "duplicate", radioGroup: group, checked, disabled, content: [] };
}
function fixture() {
  const radios = [radio("form-a/name"), radio("form-a/name", true), radio("form-b/name", true), radio(), radio(), radio("form-a/name", false, true)];
  const root: StackNode = { ...base("root"), kind: "stack", axis: "v", spacing: 0, align: "start", distribution: "start", leadInset: 0, children: radios };
  return { root, radios };
}

test("named radio groups share captured selection; separate form owners and unnamed radios have separate storage", () => {
  const { root, radios } = fixture();
  const members = controlMembers(root);
  expect(members.decls).toHaveLength(4);
  expect(members.stateOf.get(radios[0]!)).toBe(members.stateOf.get(radios[1]!));
  expect(members.stateOf.get(radios[0]!)).not.toBe(members.stateOf.get(radios[2]!));
  expect(members.stateOf.get(radios[3]!)).not.toBe(members.stateOf.get(radios[4]!));
  expect(members.decls[0]).toMatch(/Int\? = 1$/);
  expect(members.radioBindingOf?.get(radios[0]!)).not.toBe(members.radioBindingOf?.get(radios[1]!));
});

test("app controls consume selection bindings and retain disabled interaction guards", () => {
  const { root, radios } = fixture();
  const members = controlMembers(root);
  for (const radio of radios) {
    const code = controlExpr(radio, { ...members, child: () => [], theme: "light", mode: "app" }).join("\n");
    expect(code).toContain(`Toggle(isOn: ${members.radioBindingOf!.get(radio)})`);
    if (radio.disabled) expect(code).toContain(".disabled(true)");
  }
});

test("a disabled checked member seeds the group, while a group with no captured check starts empty", () => {
  const { root, radios } = fixture();
  radios[1]!.disabled = true;
  expect(controlMembers(root).decls[0]).toMatch(/Int\? = 1$/);
  radios[1]!.checked = false;
  expect(controlMembers(root).decls[0]).toMatch(/Int\? = nil$/);
});

test("fidelity radio paint keeps each captured check state without a mutable binding", () => {
  const { root, radios } = fixture();
  const members = controlMembers(root, "fidelity");
  expect(members.decls).toEqual([]);
  const lines = radios.map(radio => controlExpr(radio, { ...members, child: () => [], theme: "light", mode: "fidelity" }).join("\n"));
  expect(lines[0]).toContain("Toggle(isOn: .constant(false))");
  expect(lines[1]).toContain("Toggle(isOn: .constant(true))");
  expect(lines[0]).toContain("MarkswiftMarkToggleStyle(mark: .dot");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest("generated radio bindings execute exclusive, non-clearing, disabled-safe selection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-radio-bindings-"));
  try {
    const { root, radios } = fixture();
    const members = controlMembers(root);
    // Execute the same closures emitted into the View, backed by mutable storage rather than @State's UI lifecycle.
    const source = `import SwiftUI
${members.decls.map(line => line.replace("@State private var", "var")).join("\n")}
${radios.map((radio, index) => `let r${index} = ${members.radioBindingOf!.get(radio)}`).join("\n")}
func check(_ condition: Bool, _ message: String) { if !condition { fatalError(message) } }
check(!r0.wrappedValue && r1.wrappedValue && r2.wrappedValue, "captured checks")
r0.wrappedValue = true
check(r0.wrappedValue && !r1.wrappedValue && r2.wrappedValue, "group exclusive; other form unchanged")
r0.wrappedValue = false
check(r0.wrappedValue, "selected click cannot clear")
r1.wrappedValue = true
check(!r0.wrappedValue && r1.wrappedValue, "duplicate id/value remains a different choice")
r5.wrappedValue = true
check(!r5.wrappedValue && r1.wrappedValue, "disabled radio cannot replace selection")
r3.wrappedValue = true
r3.wrappedValue = false
check(r3.wrappedValue && !r4.wrappedValue, "unnamed cannot clear; peer independent")
r4.wrappedValue = true
check(r3.wrappedValue && r4.wrappedValue && r2.wrappedValue, "independent unnamed selections")
print("radio transitions passed")
`;
    const path = join(directory, "main.swift"), binary = join(directory, "radios");
    await Bun.write(path, source);
    const compiler = Bun.spawn(["xcrun", "swiftc", path, "-o", binary], { stdout: "pipe", stderr: "pipe" });
    const compilerOutput = await new Response(compiler.stderr).text();
    expect(await compiler.exited, compilerOutput).toBe(0);
    const run = Bun.spawn([binary], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(run.stdout).text();
    const errors = await new Response(run.stderr).text();
    expect(await run.exited, errors).toBe(0);
    expect(output).toContain("radio transitions passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);

nativeTest("radio groups compile in complete app and fidelity views", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-radio-typecheck-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const { root } = fixture();
      const output = emitSwift({ version: 1, name: "Radios", source: "radios.html", theme: "light", size: { w: 100, h: 200 }, canvas: { r: 1, g: 1, b: 1, a: 1 }, root }, "RadiosView", { mode });
      await Bun.write(join(directory, "Radios.swift"), output.view);
      await Bun.write(join(directory, "Runtime.swift"), SWIFT_RUNTIME);
      const checked = await typecheck(directory);
      expect(checked.ok, checked.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
