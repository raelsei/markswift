/**
 * Fidelity bakes the browser's line division into the literal. A "\n" is a UAX #9 paragraph separator: it ends every
 * open isolate and embedding and resolves each line on its own (X8), where the browser resolves the paragraph once and
 * reorders line by line. Text with bidi controls breaks with U+2028 LINE SEPARATOR instead, which stays in the paragraph.
 */
import { expect, test } from "bun:test";
import { emitSwift } from "../../../src/swift/emit.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { openBidi } from "../../../src/analysis/text-layout.ts";
import { LAYOUT_DOC_VERSION, type LayoutNode, type Rect } from "../../../src/model/layout.ts";
import { walk, type Screen, type TextNode, type TextRun } from "../../../src/model/semantic.ts";

const run = (text: string, breaks?: number[]): TextRun => ({
  text,
  color: { r: 0, g: 0, b: 0, a: 1 },
  font: { family: { kind: "system", design: "default" }, size: 16, weight: 400 },
  ...(breaks ? { breaks } : {}),
});

/** The fidelity Swift of one text node, as the decoded text of its `Text(verbatim:)` literals. */
function literals(runs: TextRun[]): string[] {
  const text: TextNode = {
    kind: "text",
    id: "t",
    frame: { x: 0, y: 0, w: 200, h: 60 },
    width: { kind: "fixed", px: 200 },
    height: { kind: "fixed", px: 60 },
    padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] },
    confidence: "mapped",
    diagnostics: [],
    overlays: [],
    runs,
    align: "leading",
    lines: 3,
  };
  const screen: Screen = {
    version: 1,
    name: "bidi",
    source: "t.html",
    theme: "light",
    size: { w: 200, h: 60 },
    canvas: { r: 1, g: 1, b: 1, a: 1 },
    root: text,
  };
  const view = emitSwift(screen, "BidiView", { mode: "fidelity" }).view;
  return [...view.matchAll(/Text\(verbatim: ("(?:[^"\\]|\\.)*")\)/g)].map((m) =>
    JSON.parse(m[1]!.replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, h: string) => `\\u${h.padStart(4, "0")}`)),
  );
}

test("an isolate across a baked break stays one paragraph", () => {
  const text = "Right-to-left paragraph with \u2067isolated LTR run\u2069";
  expect(literals([run(text, [text.indexOf("run")])])).toEqual([
    "Right-to-left paragraph with \u2067isolated LTR\u2028run\u2069",
  ]);
});

test("a control opened in an earlier run makes a later run's breaks line separators, also one that opens a run", () => {
  expect(literals([run("a \u2067b "), run("c d", [2]), run("e\u2069")])).toEqual(["a \u2067b ", "c\u2028d", "e\u2069"]);
  expect(literals([run("a \u202Bb "), run("c\u202C", [0])])).toEqual(["a \u202Bb", "\u2028c\u202C"]);
});

test("a nested isolate and embedding keep their nesting across a break", () => {
  expect(literals([run("\u2066x \u202Ey z\u202C\u2069", [6])])).toEqual(["\u2066x \u202Ey\u2028z\u202C\u2069"]);
  // A PDI closes the embeddings opened inside its isolate; a PDF never closes an isolate.
  expect(openBidi("\u202B\u2067\u202Aa\u2069")).toEqual(["\u202B"]);
  expect(openBidi("\u2067a\u202C")).toEqual(["\u2067"]);
});

test("text without bidi controls breaks with a bare newline", () => {
  expect(literals([run("one two three", [4, 8])])).toEqual(["one\ntwo\nthree"]);
});

test("a paragraph split where its lines clear a float closes the head's open controls and reopens them on the tail", () => {
  const font = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "15px", "line-height": "20px" };
  const el = (tag: string, bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = []): LayoutNode => ({
    tag,
    attrs: {},
    styles: { ...font, ...styles },
    bounds,
    children,
  });
  const line = (x: number, y: number, w: number, start: number, length: number) => ({
    bounds: { x, y, w, h: 20 },
    start,
    length,
  });
  const words = (text: string, bounds: Rect, lines: LayoutNode["lines"]): LayoutNode => ({
    ...el("#text", bounds, {}),
    text,
    lines,
  });
  // Four lines beside a 72px float (it clears at 76px), the fifth below it; the isolate spans lines four and five.
  const p = el("p", { x: 0, y: 0, w: 300, h: 100 }, { display: "block" }, [
    words("aaaa bbbb cccc dddd ", { x: 84, y: 0, w: 60, h: 80 }, [
      line(84, 0, 40, 0, 5),
      line(84, 20, 40, 5, 5),
      line(84, 40, 40, 10, 5),
      line(84, 60, 40, 15, 5),
    ]),
    el("bdi", { x: 0, y: 60, w: 300, h: 40 }, { display: "inline", "unicode-bidi": "isolate", direction: "rtl" }, [
      words("eeee ffff", { x: 0, y: 60, w: 300, h: 40 }, [line(124, 60, 40, 0, 5), line(0, 80, 40, 5, 4)]),
    ]),
    words(" gggg", { x: 40, y: 80, w: 40, h: 20 }, [line(40, 80, 40, 0, 5)]),
  ]);
  const thumb = el(
    "div",
    { x: 0, y: 0, w: 72, h: 72 },
    {
      display: "block",
      float: "left",
      "margin-right": "12px",
      "margin-bottom": "4px",
      "background-color": "rgb(37, 99, 235)",
    },
  );
  const root = el("main", { x: 0, y: 0, w: 300, h: 100 }, { display: "block" }, [thumb, p]);
  const screen = inferScreen(
    {
      version: LAYOUT_DOC_VERSION,
      source: "test",
      combo: { screen: "s", theme: "light" },
      size: { w: 300, h: 100 },
      viewport: { x: 0, y: 0, w: 300, h: 100 },
      conditions: [],
      dpr: 3,
      canvas: "rgb(255, 255, 255)",
      fonts: [],
      root,
    },
    "S",
  );
  const texts: string[] = [];
  walk(screen.root, (n) => {
    if (n.kind === "text") texts.push(n.runs.map((r) => r.text).join(""));
  });
  expect(texts).toEqual(["aaaa bbbb cccc dddd \u2067eeee\u2069", "\u2067ffff\u2069 gggg"]);
});
