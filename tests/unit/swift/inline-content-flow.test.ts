import { expect, test } from "bun:test";
import { compileLayout } from "../../../src/compiler/index.ts";
import { inlineContentFlowFixture } from "../../helpers/inline-content-flow-fixture.ts";

test("both modes share admitted native inline flow while fidelity retains captured heights", () => {
  const doc = inlineContentFlowFixture(), app = compileLayout(doc, { name: "InlineFlow", mode: "app", geometryInstrumentation: true, textInstrumentation: true });
  expect(app.code).toContain("MarkswiftInlineContentRow"); expect(app.code).toContain('"Include"');
  expect(app.code).not.toContain(".frame(height: 31.0"); expect(app.code).not.toContain(".frame(height: 82.0");
  expect(app.code).toContain(".padding(.bottom, 6.0)");
  const fidelity = compileLayout(doc, { name: "InlineFlow", mode: "fidelity", geometryInstrumentation: true, textInstrumentation: true });
  expect(fidelity.code).toContain("MarkswiftInlineContentRow"); expect(fidelity.code).toContain(".frame(height: 31.0");
  expect(fidelity.code).toContain(".frame(height: 82.0");
});
test("claimed raw caption tokens partition source order once and replace the old leading trim account", () => {
  const doc = inlineContentFlowFixture(), raw = doc.root.children[0]!.children[1]!.children[1]!;
  raw.textSource = { key: "dom:/0/1/1", kind: "text", raw: raw.text!, ancestors: [], origin: "dom", join: "verified", layoutPresent: true };
  const result = compileLayout(doc, { name: "ClaimedInline", mode: "app", textInstrumentation: true });
  const emissions = result.text!.emissions.filter(e => e.key.includes("/inline-"));
  expect(emissions.map(e => e.value).join("")).toBe(raw.text!);
  const ranges = emissions.flatMap(e => e.source!.units.flatMap(unit => unit.sources.map(s => [s.start, s.end])));
  expect(ranges).toEqual([[0, 1], [1, 8], [8, 9], [9, 20]]);
  const node = result.text!.nodes.find(n => n.key === emissions[0]!.node)!;
  expect(node.sourceAccounting?.excluded).toEqual([]);
  expect(emissions[0]!.unavailable.join(" ")).toContain("not TextRenderer glyph geometry");
});
test("unkeyed original occurrence never gains source claims from a nearby node", () => {
  const result = compileLayout(inlineContentFlowFixture(), { name: "UnknownInline", mode: "app", textInstrumentation: true });
  const emissions = result.text!.emissions.filter(e => e.key.includes("/inline-"));
  expect(emissions.length).toBe(4); expect(emissions.every(e => e.source === undefined)).toBe(true);
  expect(emissions.every(e => e.unavailable.includes("source lineage unavailable"))).toBe(true);
});
