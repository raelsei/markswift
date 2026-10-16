import { expect, test } from "bun:test";
import { walk, type SemNode } from "../../../src/model/semantic.ts";
import { visit } from "../../../src/swift/traversal.ts";

const base = (id: string) => ({
  id,
  frame: { x: 0, y: 0, w: 10, h: 10 },
  width: { kind: "fill" as const },
  height: { kind: "hug" as const, px: 10 },
  padding: [0, 0, 0, 0] as [number, number, number, number],
  style: { fills: [], shadows: [] },
  confidence: "mapped" as const,
  diagnostics: [],
  overlays: [],
});
const text = (id: string): SemNode =>
  ({ ...base(id), kind: "text", runs: [], align: "leading", lines: 1 }) as unknown as SemNode;

test("walkers visit a holder's alternatives after the holder and before its siblings' children", () => {
  const holder: SemNode = { ...base("holder"), kind: "box", alternatives: [text("alt0"), text("alt1")] };
  const stack = { ...base("stack"), kind: "stack", axis: "v", children: [holder] } as unknown as SemNode;
  const seen: string[] = [];
  visit(stack, (n) => seen.push(n.id));
  expect(seen).toEqual(["stack", "holder", "alt0", "alt1"]);
  const walked: string[] = [];
  walk(stack, (n) => walked.push(n.id));
  expect(walked).toEqual(["stack", "holder", "alt0", "alt1"]);
});
