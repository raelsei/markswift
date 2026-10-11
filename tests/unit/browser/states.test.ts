import { describe, expect, test } from "bun:test";
import { STYLE_WHITELIST } from "../../../src/model/layout.ts";
import { PRESSABLE_SELECTOR, TEXT_ENTRY_SELECTOR } from "../../../src/model/interactive.ts";
import { INPUT_CONTROLS } from "../../../src/html/inputs.ts";
import { snapshotToTree, toLayout, type DomSnapshot } from "../../../src/browser/snapshot.ts";
import { diffStates, PAINT_KEYS } from "../../../src/browser/states.ts";

const STATE_KEYS = [...PAINT_KEYS, "display", "visibility"];
const REST: Record<string, string> = {
  "background-color": "rgb(255, 255, 255)",
  display: "block",
  visibility: "visible",
  "outline-style": "none",
};

/** `<html><body><div id=a/><div id=b/></body></html>`: one layout entry per element, styles keyed in `keys` order. */
function synth(keys: readonly string[], items: Array<{ styles?: Record<string, string>; o?: number[] }>): DomSnapshot {
  const strings: string[] = [];
  const S = (s: string) => {
    const i = strings.indexOf(s);
    if (i >= 0) return i;
    strings.push(s);
    return strings.length - 1;
  };
  const names = ["HTML", "BODY", ...items.map(() => "DIV")];
  const all: Array<{ styles?: Record<string, string>; o?: number[] }> = [{}, {}, ...items];
  return {
    documents: [
      {
        documentURL: S("http://x/"),
        nodes: {
          nodeType: names.map(() => 1),
          nodeName: names.map(S),
          nodeValue: names.map(() => -1),
          parentIndex: names.map((_, i) => (i === 0 ? -1 : i === 1 ? 0 : 1)),
          attributes: names.map((_, i) => (i > 1 ? [S("id"), S(`n${i}`)] : [])),
          backendNodeId: names.map((_, i) => i + 100),
        },
        layout: {
          nodeIndex: names.map((_, i) => i),
          styles: all.map((it) => {
            const st = { ...REST, ...it.styles };
            return keys.map((k) => (st[k] !== undefined ? S(st[k]!) : -1));
          }),
          bounds: names.map(() => [0, 0, 10, 10]),
          text: names.map(() => -1),
          offsetRects: all.map((it) => it.o ?? [0, 0, 10, 10]),
        },
        textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] },
      },
    ],
    strings,
  };
}

const rest = synth(STYLE_WHITELIST, [{}, {}]);

describe("diffStates", () => {
  test("a background change is one delta with only that key", () => {
    const state = synth(STATE_KEYS, [{ styles: { "background-color": "rgb(0, 0, 255)" } }, {}]);
    const { deltas, moved, revealed } = diffStates(rest, state, false);
    expect([...deltas]).toEqual([[2, { "background-color": "rgb(0, 0, 255)" }]]);
    expect([moved, revealed]).toEqual([0, 0]);
  });

  test("a moved offset box contributes nothing and is counted", () => {
    const state = synth(STATE_KEYS, [{ styles: { "background-color": "rgb(0, 0, 255)" }, o: [0, 2, 10, 10] }, {}]);
    const { deltas, moved } = diffStates(rest, state, false);
    expect(deltas.size).toBe(0);
    expect(moved).toBe(1);
  });

  test("a visibility change is revealed, not a delta", () => {
    const state = synth(STATE_KEYS, [{}, { styles: { visibility: "hidden", "background-color": "rgb(1, 2, 3)" } }]);
    const { deltas, revealed } = diffStates(rest, state, false);
    expect(deltas.size).toBe(0);
    expect(revealed).toBe(1);
  });

  test("Chrome's auto focus ring is ignored for focus", () => {
    const state = synth(STATE_KEYS, [{ styles: { "outline-style": "auto", "outline-color": "rgb(16, 16, 16)" } }, {}]);
    expect(diffStates(rest, state, true).deltas.size).toBe(0);
    expect(diffStates(rest, state, false).deltas.get(2)).toEqual({
      "outline-style": "auto",
      "outline-color": "rgb(16, 16, 16)",
    });
  });

  test("deltas land on the right LayoutNode", () => {
    const state = synth(STATE_KEYS, [{}, { styles: { "background-color": "rgb(0, 0, 255)" } }]);
    const { deltas } = diffStates(rest, state, false);
    const tree = snapshotToTree(rest, undefined, { pressed: deltas, focused: new Map() });
    const body = toLayout(tree.children[0]!, { x: 0, y: 0 }, (_t, _a, path) => path || "root")!;
    expect(body.children.map((c) => c.states)).toEqual([
      undefined,
      { pressed: { "background-color": "rgb(0, 0, 255)" } },
    ]);
  });

  test("selectors and paint keys agree with the whitelist and input routing", () => {
    for (const k of PAINT_KEYS) expect(STYLE_WHITELIST).toContain(k);
    const types = (sel: string) => [...sel.matchAll(/input\[type="([a-z]+)" i\]/g)].map((m) => m[1]).sort();
    const routed = (...kinds: string[]) =>
      Object.entries(INPUT_CONTROLS)
        .filter(([, kind]) => kinds.includes(kind))
        .map(([t]) => t)
        .sort();
    expect(types(PRESSABLE_SELECTOR)).toEqual(routed("button"));
    expect(types(TEXT_ENTRY_SELECTOR)).toEqual(routed("textField", "secureField"));
  });
});
