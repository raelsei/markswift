import type { CorpusFixture } from "../corpus-model.ts";

export type InteractionStep =
  | { kind: "expectValue"; target: string; value: string; container?: string }
  | { kind: "expectSelection"; target: string; selected: boolean; container?: string }
  | { kind: "expectLabel"; target: string; label: string; container?: string }
  | { kind: "expectEnabled"; target: string; enabled: boolean }
  | { kind: "expectMissing"; target: string }
  | { kind: "expectExpanded"; target: string; expanded: boolean }
  | { kind: "expectPresent"; target: string; present: boolean }
  | { kind: "tap" | "tapInert"; target: string; container?: string }
  | { kind: "replaceText"; target: string; text: string }
  | { kind: "scroll"; target: string; direction: "up" | "down" };

export interface InteractionPlan {
  fixture: string; structureKey: string; category: string; split: CorpusFixture["split"];
  viewName: string; testName: string; height: number; width: number; theme: "light" | "dark";
  steps: InteractionStep[]; coveredControls: string[]; transitionCount: number; limitations: string[];
}
export interface InteractionResult {
  fixture: string; testName: string; status: "passed" | "failed" | "not-executed";
}
export interface InteractionManifest {
  version: 1; preparedAt: string; sourceHash: string; swiftHash: string;
  generatedFiles: Record<string, string>; preparationSourceChanged?: string;
  browserOracles?: Array<{ fixture: string; path: string; hash: string }>;
  sourceSnapshot?: { directory: string; sourceHash: string; dependencyHash: string };
  fixtures: Array<{ fixture: string; sourceHash: string; layoutHash: string; diagnostics: unknown }>;
  plans: InteractionPlan[];
  /** A prepared project never implies UI tests ran. */
  status: "prepared" | "executed"; results: InteractionResult[]; passedStatefulFamilies: number;
  execution?: { startedAt: string; completedAt: string; simulator: string; exitCode: number; resultBundle: string;
    sourceChanged?: string; snapshotChanged?: string; generatedChanged?: string; artifactHashes?: Record<string, string> };
}

export const pilotInteractionFixtures = [
  "text-controls-login-fields", "text-controls-multiline-note",
  "boolean-controls-checkbox-preferences", "boolean-controls-switch-roles", "boolean-controls-two-radio-groups",
  "selection-controls-disabled-selected-choice", "selection-controls-multiple-optgroups", "selection-controls-hidden-choice-paint",
] as const;
