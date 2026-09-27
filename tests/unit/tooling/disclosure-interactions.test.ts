import { expect, test } from "bun:test";
import { disclosureSteps } from "../../../tools/verify/interaction/disclosure-scenarios.ts";
import { interactionTests } from "../../../tools/verify/interaction/ui-tests.ts";
import type { InteractionPlan, InteractionStep } from "../../../tools/verify/interaction/types.ts";
import type { ControlNode, SemBase } from "../../../src/model/semantic.ts";

const base: SemBase = { id: "#details", frame: { x: 0, y: 0, w: 200, h: 100 }, width: { kind: "fill" }, height: { kind: "hug" },
  padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, overlays: [], confidence: "mapped", notes: [] };
const node = (): ControlNode => ({ ...structuredClone(base), kind: "control", control: "disclosure", expanded: true,
  disclosureLayout: { gap: 8, labelInset: 0, contentInset: 0, contentAvailable: true },
  label: { ...structuredClone(base), id: "#summary", kind: "svg", viewBox: [0, 0, 10, 20], paths: [],
    disclosureSymbol: { capturedExpanded: true, rect: { x: 0, y: 4, w: 9, h: 9 } } },
  content: [{ ...structuredClone(base), id: "#body", kind: "box" }] });

test("open-captured standard disclosures exercise original summary activation and body disappearance/reappearance", () => {
  const steps: InteractionStep[] = [], limitations: string[] = [];
  expect(disclosureSteps(node(), steps, limitations)).toBe(2);
  expect(steps.filter(step => step.kind === "tap")).toEqual([{ kind: "tap", target: "#summary" }, { kind: "tap", target: "#summary" }]);
  expect(steps).toContainEqual({ kind: "expectPresent", target: "#details/content", present: false });
  expect(steps.at(-1)).toEqual({ kind: "expectPresent", target: "#details/content", present: true });
  expect(limitations).toEqual([]);
});

test("closed or custom-marker disclosures never invent opening-state content or a standard marker", () => {
  const closed = node(); closed.expanded = false;
  const steps: InteractionStep[] = [], limitations: string[] = [];
  expect(disclosureSteps(closed, steps, limitations)).toBe(0); expect(steps).toEqual([]);
  expect(limitations[0]).toContain("no captured content layout");
  const custom = node(); if (custom.label?.kind === "svg") delete custom.label.disclosureSymbol;
  expect(disclosureSteps(custom, steps, limitations)).toBe(0); expect(steps).toEqual([]);
});

test("XCUI expanded checks require a native Button and actual value/element disappearance", () => {
  const steps: InteractionStep[] = []; disclosureSteps(node(), steps, []);
  const plan = { fixture: "generic", viewName: "GenericView", testName: "testGeneric", steps } as InteractionPlan;
  const swift = interactionTests([plan]);
  expect(swift).toContain("XCTAssertEqual(target.elementType, .button)");
  expect(swift).toContain('assertValue(target, "collapsed")');
  expect(swift).toContain('NSPredicate(format: "exists == false")');
  expect(swift).toContain("target.tap()");
  expect(swift).not.toMatch(/\.open\s*=|UIHostingController|\.isExpanded\s*=/);
});
