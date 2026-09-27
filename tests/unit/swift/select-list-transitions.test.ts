import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControlNode } from "../../../src/model/semantic.ts";
import { selectListActivation } from "../../../src/swift/select-list-control.ts";
import { SELECT_LIST_RUNTIME } from "../../../src/swift/select-list-runtime.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("emitted Swift list actions execute toggles, exclusivity and disabled/hidden guards", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-list-transitions-"));
  try {
    const node = { selectList: "multiple" } as ControlNode;
    // These are the same assignment bodies emitted into each row action, with ordinary Swift
    // storage so the test executes them without depending on @State's mounted view lifecycle.
    const source = `import SwiftUI
${SELECT_LIST_RUNTIME}
var many: Set<Int> = [0, 2, 3, 4]
var single: Int = -1
var other: Set<Int> = [1]
func multipleClick(_ choice: MarkswiftSelectChoice) { ${selectListActivation(node, "many")} }
func singleClick(_ choice: MarkswiftSelectChoice) { ${selectListActivation({ ...node, selectList: "single" }, "single")} }
func disabledClick(_ choice: MarkswiftSelectChoice) { ${selectListActivation({ ...node, disabled: true }, "many")} }
func disabledSingleClick(_ choice: MarkswiftSelectChoice) { ${selectListActivation({ ...node, selectList: "single", disabled: true }, "single")} }
let choices = [
    MarkswiftSelectChoice(id: 0, value: "same", label: "Twin", disabled: false, hidden: false),
    MarkswiftSelectChoice(id: 1, value: "same", label: "Twin", disabled: false, hidden: false),
    MarkswiftSelectChoice(id: 2, value: "", label: "", disabled: false, hidden: false),
    MarkswiftSelectChoice(id: 3, value: "blocked", label: "Blocked", disabled: true, hidden: false),
    MarkswiftSelectChoice(id: 4, value: "hidden", label: "Hidden", disabled: false, hidden: true),
    MarkswiftSelectChoice(id: 5, value: "invisible", label: "Invisible", disabled: false, hidden: false, invisible: true),
]
func check(_ condition: Bool, _ message: String) { if !condition { fatalError(message) } }
multipleClick(choices[1])
check(many == [0, 1, 2, 3, 4], "duplicate labels and values activate independently")
multipleClick(choices[0])
check(many == [1, 2, 3, 4], "toggle clears one ordinal only")
multipleClick(choices[2])
check(many == [1, 3, 4], "empty label and value can be deselected")
multipleClick(choices[3]); multipleClick(choices[4]); disabledClick(choices[1])
check(many == [1, 3, 4] && other == [1], "disabled and hidden captured seeds cannot activate; another list unchanged")
many.insert(5); multipleClick(choices[5])
check(many.contains(5), "visibility-hidden captured selection cannot toggle")
singleClick(choices[0]); singleClick(choices[1])
check(single == 1, "single list replaces selected ordinal")
singleClick(choices[1]); singleClick(choices[3]); singleClick(choices[4]); singleClick(choices[5]); disabledSingleClick(choices[0])
check(single == 1, "selected single click cannot clear; inert choices and disabled control cannot replace it")
singleClick(choices[2])
check(single == 2, "empty-label single option is a real selection")
let own = MarkswiftSelectRowAppearance(height: 17, padding: EdgeInsets(), font: .body, color: .red, background: .yellow)
let selectedPaint = markswiftSelectRowPaint(own, selected: many.contains(1))
check(selectedPaint.color == .red && selectedPaint.background == .yellow && selectedPaint.highlight != .clear,
      "changed selected row keeps its own text/base paint and uses a native highlight")
let seeded = MarkswiftSelectRowAppearance(height: 17, padding: EdgeInsets(), font: .body, color: .green, background: .blue, initiallySelected: true)
let initialPaint = markswiftSelectRowPaint(seeded, selected: true)
check(initialPaint.color == .green && initialPaint.background == .blue && initialPaint.highlight == .clear,
      "unchanged selected row keeps captured paint")
let clearedPaint = markswiftSelectRowPaint(seeded, selected: false)
check(clearedPaint.color == .green && clearedPaint.background == .clear && clearedPaint.highlight == .clear,
      "deselected row uses parent background, never another option's disabled or selected colors")
print("select list transitions passed")
`;
    const path = join(directory, "main.swift"), binary = join(directory, "selection-lists");
    await Bun.write(path, source);
    const compiler = Bun.spawn(["xcrun", "swiftc", path, "-o", binary], { stdout: "pipe", stderr: "pipe" });
    const compilerOutput = await new Response(compiler.stderr).text();
    expect(await compiler.exited, compilerOutput).toBe(0);
    const run = Bun.spawn([binary], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(run.stdout).text(), errors = await new Response(run.stderr).text();
    expect(await run.exited, errors).toBe(0);
    expect(output).toContain("select list transitions passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
