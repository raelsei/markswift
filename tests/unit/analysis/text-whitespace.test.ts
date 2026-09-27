import { expect, test } from "bun:test";
import { normalizeWhitespace } from "../../../src/analysis/text-runs.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { textSourceProjection } from "../../../src/analysis/text-provenance.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";

function fixture(values: string[], whitespace = "normal"): LayoutDoc {
  const styles = { display: "block", "font-family": "system-ui", "font-size": "14px", "font-weight": "400", "line-height": "20px", "white-space": whitespace };
  let x = 0;
  return { version: 1, source: "whitespace", combo: { screen: "text", theme: "light", demoState: "normal" }, size: { w: 200, h: 20 }, dpr: 2, canvas: "white", root: {
    tag: "p", attrs: {}, styles, bounds: { x: 0, y: 0, w: 200, h: 20 }, children: values.map(text => {
      const node: LayoutNode = { tag: "#text", attrs: {}, styles: {}, text, bounds: { x, y: 0, w: text.length * 7, h: 17 }, children: [] };
      x += node.bounds.w; return node;
    }),
  } };
}
function literal(values: string[], whitespace?: string): string {
  const node = inferScreen(fixture(values, whitespace), "Whitespace").root;
  expect(node.kind).toBe("text");
  return node.kind === "text" ? node.runs.map(run => run.text).join("") : "";
}

test("document collapse retains control glyphs and Unicode space separators", () => {
  for (const separator of ["\f", "\v", "\u00a0", "\u2003", "\u202f", "\ufeff"]) {
    const value = `A${separator}B`;
    for (const mode of ["collapse", "preserve-breaks", "preserve"] as const) {
      expect(normalizeWhitespace(value, mode)).toEqual({ text: value, src: [0, 1, 2] });
    }
  }
  expect(normalizeWhitespace("A \t\n\r B", "collapse")).toEqual({ text: "A B", src: [0, 1, 6] });
});

test("collapsed DOM carriage returns become spaces; preserved control processing stays explicit", () => {
  expect(normalizeWhitespace("A\rB", "preserve")).toEqual({ text: "A\rB", src: [0, 1, 2] });
  expect(normalizeWhitespace("A\rB", "preserve-breaks")).toEqual({ text: "A B", src: [0, 1, 2] });
  expect(normalizeWhitespace("A\nB", "preserve-breaks").text).toBe("A\nB");
  expect(inferScreen(fixture(["A\rB"], "pre-wrap"), "CarriageReturn").root.notes.join(" "))
    .toContain("preserved DOM carriage-return layout is unproved");
  expect(inferScreen(fixture(["A\fB"]), "FormFeed").root.notes.join(" "))
    .toContain("browser control-glyph synthesis is not reconstructed");
});

test("run-edge trimming and whitespace-only detection retain noncollapsible characters", () => {
  for (const edge of ["\u00a0", "\u2003", "\u202f", "\f", "\v"]) {
    expect(literal([`${edge}Word${edge}`])).toBe(`${edge}Word${edge}`);
    expect(literal([edge])).toBe(edge);
    expect(literal([` ${edge}Word${edge} `])).toBe(`${edge}Word${edge}`);
  }
});

test("ordinary source space does not collapse with an adjacent nonbreaking space", () => {
  expect(literal(["A\u00a0", " B"])).toBe("A\u00a0 B");
  expect(literal(["A", "\u00a0", "B"])).toBe("A\u00a0B");
  expect(literal(["A ", " B"])).toBe("A B");
  expect(literal([" A  B "], "pre-wrap")).toBe(" A  B ");
});

test("source copy intervals for retained controls never become CSS collapse claims", () => {
  const raw = "A\f\vB", node = fixture([raw]).root.children[0]!;
  node.textSource = { key: "dom:/0", kind: "text", raw, ancestors: [], origin: "dom", join: "verified", layoutPresent: true };
  const normalized = normalizeWhitespace(raw, "collapse");
  const projection = textSourceProjection(node, normalized.text, normalized.src, "collapse")!;
  expect(projection.units.map(unit => unit.operation)).toEqual(["copy", "copy", "copy", "copy"]);
  expect(projection.units.map(unit => unit.sources[0])).toEqual([0, 1, 2, 3].map(start => ({ occurrence: "dom:/0", start, end: start + 1 })));
});
