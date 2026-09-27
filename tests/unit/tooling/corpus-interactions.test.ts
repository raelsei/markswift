import { expect, test } from "bun:test";
import { interactionPlan } from "../../../tools/verify/interaction/scenarios.ts";
import { interactionHost } from "../../../tools/verify/interaction/host.ts";
import { interactionTests } from "../../../tools/verify/interaction/ui-tests.ts";
import { interactionProject } from "../../../tools/verify/interaction/xcode-project.ts";
import { interactionResults } from "../../../tools/verify/interaction/results.ts";
import { corpusFixtures } from "../../../tools/verify/corpus-fixtures.ts";
import type { ControlNode } from "../../../src/model/semantic.ts";
import { pilotInteractionFixtures } from "../../../tools/verify/interaction/types.ts";

const base = { frame: { x: 0, y: 0, w: 100, h: 100 }, width: { kind: "fill" }, height: { kind: "fixed", px: 100 },
  padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, overlays: [], confidence: "mapped", notes: [], content: [] } as const;
function control(id: string, fields: Partial<ControlNode>): ControlNode {
  return { ...structuredClone(base), kind: "control", id, control: "toggle", ...fields } as ControlNode;
}
const fixture = corpusFixtures.find(item => item.id === "selection-controls-duplicate-values")!;

test("default interaction pilots are distinct frozen development families and preserve holdouts", () => {
  const fixtures = pilotInteractionFixtures.map(id => corpusFixtures.find(item => item.id === id)!);
  expect(fixtures).toHaveLength(8);
  expect(fixtures.every(item => item?.split === "development")).toBe(true);
  expect(new Set(fixtures.map(item => item.structureKey)).size).toBe(fixtures.length);
  expect(pilotInteractionFixtures).not.toContain("selection-controls-single-listbox");
  expect(pilotInteractionFixtures).not.toContain("selection-controls-duplicate-values");
  expect(pilotInteractionFixtures).not.toContain("boolean-controls-radio-output-mode");
});

test("ordinal list plans independently toggle duplicate submitted values and retain hidden state", () => {
  const node = control("#labels", { control: "picker", selectList: "multiple", selectedChoices: [0, 3], choices: [
    { id: 0, value: "same", label: "Twin", disabled: false }, { id: 1, value: "same", label: "Twin", disabled: false },
    { id: 2, value: "", label: "", disabled: true }, { id: 3, value: "keep", label: "Hidden", disabled: false, hidden: true },
  ] });
  const plan = interactionPlan(fixture, [node]);
  expect(plan.steps).toContainEqual({ kind: "expectMissing", target: "#labels/option/3" });
  expect(plan.steps).toContainEqual({ kind: "tap", target: "#labels/option/0", container: "#labels" });
  expect(plan.steps).toContainEqual({ kind: "expectSelection", target: "#labels/option/1", selected: true, container: "#labels" });
  expect(plan.steps.some(step => step.kind === "tap" && step.target.endsWith("/2"))).toBe(false);
  expect(plan.coveredControls).toEqual(["#labels"]);
});

test("radio plans verify exclusivity, non-clearing selection and independent named groups", () => {
  const nodes = [control("theme-a", { control: "radio", radioGroup: "theme", checked: true }),
    control("theme-b", { control: "radio", radioGroup: "theme" }),
    control("platform-a", { control: "radio", radioGroup: "platform" }),
    control("platform-b", { control: "radio", radioGroup: "platform", checked: true })];
  const plan = interactionPlan(fixture, nodes);
  const firstTap = plan.steps.findIndex(step => step.kind === "tap");
  expect(plan.steps.slice(firstTap, firstTap + 5)).toEqual([
    { kind: "tap", target: "theme-b" }, { kind: "expectValue", target: "theme-a", value: "unselected" },
    { kind: "expectValue", target: "theme-b", value: "selected" },
    { kind: "expectValue", target: "platform-a", value: "unselected" },
    { kind: "expectValue", target: "platform-b", value: "selected" },
  ]);
  expect(plan.steps.filter(step => step.kind === "tap" && step.target === "theme-b")).toHaveLength(2);
});

test("disabled controls receive coordinate gestures without synthetic property writes", () => {
  const plan = interactionPlan(fixture, [control("off", { disabled: true, checked: true }), control("on", {})]);
  expect(plan.steps).toContainEqual({ kind: "expectEnabled", target: "off", enabled: false });
  expect(plan.steps).toContainEqual({ kind: "tapInert", target: "off" });
  const tests = interactionTests([plan]);
  expect(tests).toContain("XCUIApplication()");
  expect(tests).toContain("coordinate(withNormalizedOffset:");
  expect(tests).toContain(".tap()");
  expect(tests).toContain("XCTAttachment(screenshot: app.screenshot())");
  expect(tests).not.toMatch(/UIHostingController|\.isOn\s*=|\.text\s*=|layer\.render/);
});

test("host restricts URL actions and project contains real app plus UI-testing targets", () => {
  const plan = interactionPlan(fixture, [control("field", { control: "textField", value: "Original" })]);
  const host = interactionHost([plan], false);
  expect(host).toContain("OpenURLAction"); expect(host).toContain("return .handled");
  expect(host).not.toContain("UIApplication.shared.open");
  const project = interactionProject(["App/Host.swift", "App/Generated/View.swift"], ["App/Resources/Fonts"]);
  expect(project.pbxproj).toContain('productType = "com.apple.product-type.application"');
  expect(project.pbxproj).toContain('productType = "com.apple.product-type.bundle.ui-testing"');
  expect(project.pbxproj).toContain("TEST_TARGET_NAME = CorpusInteractionApp");
  expect(project.scheme).toContain("CorpusInteractionUITests.xctest");
  expect(project.scheme).toContain('parallelizable="NO"');
  expect(() => interactionProject(["../escape.swift"], [])).toThrow("Unsafe");
});

test("passing evidence requires every expected XCUI test result, not an exit code or screenshot", () => {
  const plans = [interactionPlan(fixture, [control("a", {})])];
  const name = plans[0]!.testName;
  expect(interactionResults(plans, { testNodes: [] })).toEqual([{ fixture: fixture.id, testName: name, status: "not-executed" }]);
  expect(interactionResults(plans, { testNodes: [{ nodeType: "Test Case", name: name + "()", result: "Passed" }] })[0]!.status).toBe("passed");
  expect(interactionResults(plans, { testNodes: [{ nodeType: "Test Case", name: name + "()", result: "Skipped" }] })[0]!.status).toBe("not-executed");
  expect(interactionResults(plans, { testNodes: [{ nodeType: "Test Case", name: name + "()", result: "Failed" }] })[0]!.status).toBe("failed");
});
