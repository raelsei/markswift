import type { InteractionPlan, InteractionResult } from "./types.ts";

/** Read xcresult test nodes rather than inferring execution from logs, exit codes or images. */
export function interactionResults(plans: readonly InteractionPlan[], report: unknown): InteractionResult[] {
  const tests: Array<{ name: string; result: string }> = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    if (node.nodeType === "Test Case" && typeof node.name === "string" && typeof node.result === "string") {
      tests.push({ name: node.name, result: node.result });
    }
    Object.values(node).forEach(visit);
  };
  visit(report);
  return plans.map(plan => {
    const matches = tests.filter(test => test.name.replace(/\(\)$/, "") === plan.testName);
    const status = matches.length === 1 && matches[0]!.result === "Passed" ? "passed"
      : matches.some(test => test.result === "Failed") ? "failed" : "not-executed";
    return { fixture: plan.fixture, testName: plan.testName, status };
  });
}
