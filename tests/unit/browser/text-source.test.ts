import { expect, test } from "bun:test";
import { attachTextSources } from "../../../src/browser/text-source.ts";
import { toLayout } from "../../../src/browser/snapshot-layout.ts";
import type { Raw } from "../../../src/browser/snapshot-types.ts";
import { TextSourceCapture, TextRunSource } from "../../../src/model/text-source.ts";

const rect = { x: 0, y: 0, w: 100, h: 20 };
function raw(name: string, type: number, value = "", children: Raw[] = [], laidOut = true): Raw {
  const node: Raw = { idx: 0, name, type, value, attrs: {}, styles: {}, children, ...(laidOut ? { bounds: rect } : {}) };
  if (type === 3) node.text = value;
  return node;
}
const identity = (tag: string, attrs: Record<string, string>, path: string) => attrs.id ? `#${attrs.id}` : `${tag}:${path}`;
const live = (key: string, type: number, name: string, value = "", ancestors: Array<{ key: string; tag: string; display: string }> = []) => ({ key, type, name, value, ancestors });

test("all-child live joins retain raw zero-advance text and distinct duplicate-id occurrences before flattening", () => {
  const first = raw("#text", 3, "AVATAR "), blank = raw("#text", 3, " \n", [], false), second = raw("#text", 3, "office");
  const a = raw("span", 1, "", [first]); a.attrs.id = "same";
  const b = raw("span", 1, "", [second], false); b.attrs.id = "same"; b.styles.display = "contents";
  const root = raw("main", 1, "", [a, raw("#comment", 8, "comment", [], false), blank, b, raw("br", 1)]);
  const ancestors = [{ key: "dom:/", tag: "main", display: "block" }];
  attachTextSources(root, [live("dom:/", 1, "main"), live("dom:/0", 1, "span"), live("dom:/0/0", 3, "#text", first.value, ancestors), live("dom:/1", 8, "#comment", "comment"), live("dom:/2", 3, "#text", blank.value, ancestors), live("dom:/3", 1, "span"), live("dom:/3/0", 3, "#text", second.value, [...ancestors, { key: "dom:/3", tag: "span", display: "contents" }]), live("dom:/4", 1, "br", "", ancestors)]);
  const converted = toLayout(root, { x: 0, y: 0 }, identity)!;
  expect(converted.textSourceCapture?.occurrences.map(entry => [entry.key, entry.raw, entry.layoutPresent])).toEqual([
    ["dom:/0/0", "AVATAR ", true], ["dom:/2", " \n", false], ["dom:/3/0", "office", true], ["dom:/4", "", true],
  ]);
  expect(converted.children[0]!.children[0]!.textSource?.key).toBe("dom:/0/0");
  expect(converted.children[1]!.textSource?.key).toBe("dom:/3/0");
  expect(converted.children[1]!.textSource?.ancestors.some(entry => entry.display === "contents")).toBe(true);
  expect(converted.children[2]!.textSource?.kind).toBe("br");
  expect(TextSourceCapture.parse(converted.textSourceCapture).trust).toBe("converter-capture-claim");
});

test("join mismatches are unavailable and never repaired by id, nearby value, or filtered path", () => {
  const text = raw("#text", 3, "Before");
  const root = raw("main", 1, "", [text]);
  attachTextSources(root, [live("dom:/", 1, "main"), live("dom:/0", 3, "#text", "After")]);
  expect(text.textSource?.join).toBe("unavailable");
  expect(text.textSource?.raw).toBe("Before");
  expect(root.textSourceCapture?.unavailable.join(" ")).toContain("value mismatch");
});

test("pseudo and shadow composition stay explicit unavailable without consuming real DOM child indices", () => {
  const pseudo = raw("::before", 1, "", [raw("#text", 3, "generated")]); pseudo.pseudo = "before";
  const shadow = raw("span", 1, "", [raw("#text", 3, "shadow")]); shadow.shadowRootType = "open";
  const text = raw("#text", 3, "source");
  const root = raw("main", 1, "", [pseudo, text, shadow]);
  attachTextSources(root, [live("dom:/", 1, "main"), live("dom:/0", 3, "#text", "source")]);
  expect(text.textSource?.key).toBe("dom:/0");
  expect(text.textSource?.join).toBe("verified");
  expect(root.textSourceCapture?.occurrences.filter(entry => entry.origin !== "dom").every(entry => entry.join === "unavailable")).toBe(true);
  expect(root.textSourceCapture?.occurrences.some(entry => entry.raw === "generated")).toBe(true);
  expect(root.textSourceCapture?.occurrences.some(entry => entry.raw === "shadow")).toBe(true);
});

test("source projection schema allows cross-occurrence collapse and rejects inverted UTF16 intervals", () => {
  const source = { version: 1, units: [{ output: [0, 1], operation: "collapse", group: "collapse:1", sources: [{ occurrence: "dom:/0", start: 2, end: 3 }, { occurrence: "dom:/1", start: 0, end: 2 }] }], excluded: [], unavailable: [] };
  expect(TextRunSource.parse(source).units[0]!.sources).toHaveLength(2);
  expect(TextRunSource.safeParse({ ...source, units: [{ ...source.units[0], sources: [{ occurrence: "dom:/0", start: 3, end: 2 }] }] }).success).toBe(false);
});

test("empty live Text omitted by a snapshot remains an unavailable occurrence in original order", () => {
  const root = raw("main", 1, "", [raw("#text", 3, "Words")]);
  attachTextSources(root, [live("dom:/", 1, "main"), live("dom:/0", 3, "#text", "Words"), live("dom:/1", 3, "#text", "")]);
  expect(root.textSourceCapture?.occurrences.map(entry => [entry.key, entry.raw])).toEqual([["dom:/0", "Words"], ["dom:/1", ""]]);
  expect(root.textSourceCapture?.occurrences[1]!.join).toBe("unavailable");
  expect(root.textSourceCapture?.unavailable).toContain("raw source occurrence missing dom:/1");
});
