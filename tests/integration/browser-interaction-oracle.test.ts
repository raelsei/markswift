import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusFixtures } from "../../tools/verify/corpus-fixtures.ts";
import { captureBrowserOracle, freezeBrowserExpectations } from "../../tools/verify/interaction/browser-oracle.ts";
import type { InteractionPlan } from "../../tools/verify/interaction/types.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function plan(id: string, steps: InteractionPlan["steps"]): InteractionPlan {
  const fixture = corpusFixtures.find(item => item.id === id)!;
  return { fixture: id, structureKey: fixture.structureKey, category: fixture.category, split: fixture.split,
    viewName: "OracleOnly", testName: "testOracle", width: 390, height: fixture.height, theme: "light",
    steps, coveredControls: [], transitionCount: 0, limitations: [] };
}

browserTest("independent Chrome AX and additive pointer gestures retain hidden state without inferred controls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-browser-oracle-"));
  try {
    const id = "selection-controls-hidden-choice-paint";
    const authored = plan(id, [
      { kind: "expectMissing", target: "#painted/option/1" }, { kind: "expectMissing", target: "#painted/option/3" },
      { kind: "tap", target: "#painted/option/0" }, { kind: "expectSelection", target: "#painted/option/0", selected: false },
      { kind: "tap", target: "#painted/option/2" }, { kind: "expectSelection", target: "#painted/option/2", selected: true },
      { kind: "scroll", target: "#painted", direction: "up" }, { kind: "tap", target: "#painted/option/4" },
    ]);
    const captured = await captureBrowserOracle(corpusFixtures.find(item => item.id === id)!, authored, directory);
    expect(captured.oracle.snapshots[0]!.controls["#painted"]!.selectedOrdinals).toEqual([0, 1]);
    const hidden = captured.oracle.snapshots[0]!.controls["#painted/option/3"]!;
    expect(hidden).toMatchObject({ visible: false, accessible: false, selected: false, rect: { height: 25 } });
    expect(captured.oracle.snapshots.at(-1)!.controls["#painted"]!.selectedOrdinals).toEqual([1, 2, 4]);
    expect(captured.oracle.multipleSelectionGesture).toContain(process.platform === "darwin" ? "Meta-click" : "Control-click");
    expect(freezeBrowserExpectations(authored, captured.oracle).steps).toEqual(authored.steps);
    expect(freezeBrowserExpectations(authored, captured.oracle).transitionCount).toBe(3);
    const poisoned = structuredClone(authored); poisoned.steps[3] = { kind: "expectSelection", target: "#painted/option/0", selected: true };
    expect(() => freezeBrowserExpectations(poisoned, captured.oracle)).toThrow("disagrees with direct browser state");
    expect((await readFile(join(directory, captured.oracle.snapshots[0]!.screenshot))).byteLength).toBeGreaterThan(1000);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60_000);

browserTest("disabled negative clicks and keyboard typing use live browser DOM observations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-browser-inert-"));
  try {
    const id = "selection-controls-disabled-selected-choice";
    const authored = plan(id, [{ kind: "tapInert", target: "#release/option/1" }, { kind: "expectSelection", target: "#release/option/1", selected: true },
      { kind: "tap", target: "#release/option/2" }, { kind: "expectSelection", target: "#release/option/1", selected: false }]);
    const captured = await captureBrowserOracle(corpusFixtures.find(item => item.id === id)!, authored, join(directory, "disabled"));
    expect(captured.oracle.snapshots[1]!.controls["#release"]!.selectedOrdinals).toEqual([1]);
    expect(captured.oracle.snapshots[1]!.controls["#release/option/1"]!.disabled).toBe(true);
    expect(captured.oracle.snapshots[3]!.controls["#release"]!.selectedOrdinals).toEqual([2]);
    expect(freezeBrowserExpectations(authored, captured.oracle).steps).toEqual(authored.steps);
    expect(freezeBrowserExpectations(authored, captured.oracle).transitionCount).toBe(1);
    const textID = "text-controls-login-fields", text = plan(textID, [{ kind: "replaceText", target: "#email", text: "NativeUIInput2026" },
      { kind: "expectValue", target: "#email", value: "NativeUIInput2026" }]);
    const typed = await captureBrowserOracle(corpusFixtures.find(item => item.id === textID)!, text, join(directory, "typed"));
    expect(typed.oracle.snapshots[0]!.controls["#email"]!.value).toBe("developer@example.test");
    expect(typed.oracle.snapshots[1]!.gesture).toContain("keyboard.type");
    expect(freezeBrowserExpectations(text, typed.oracle).steps).toEqual(text.steps);
    expect(freezeBrowserExpectations(text, typed.oracle).transitionCount).toBe(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60_000);
