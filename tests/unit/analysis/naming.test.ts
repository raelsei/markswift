import { expect, test } from "bun:test";
import { fieldOf, nameHintOf } from "../../../src/analysis/naming.ts";

test("name hints follow component > id > slot > aria > class > tag", () => {
  const all = {
    "data-markswift-component": "Member",
    id: "team",
    "data-slot": "item",
    "aria-label": "Person",
    class: "member-card",
  };
  expect(nameHintOf("li", all)).toEqual({ words: "Member", source: "component" });
  const { "data-markswift-component": _c, ...noComponent } = all;
  expect(nameHintOf("li", noComponent)).toEqual({ words: "team", source: "id" });
  const { id: _i, ...noId } = noComponent;
  expect(nameHintOf("li", noId)).toEqual({ words: "item", source: "slot" });
  const { "data-slot": _s, ...noSlot } = noId;
  expect(nameHintOf("li", noSlot)).toEqual({ words: "Person", source: "aria" });
  const { "aria-label": _a, ...noAria } = noSlot;
  expect(nameHintOf("li", noAria)).toEqual({ words: "member-card", source: "class" });
  expect(nameHintOf("li", {})).toEqual({ words: "Row", source: "tag" });
  expect(nameHintOf("li", { id: "  " })).toEqual({ words: "Row", source: "tag" });
});

test("utility classes are skipped, semantic classes kept", () => {
  expect(nameHintOf("div", { class: "flex p-4 hover:bg-x w-[3px] text-sm member-card" })).toEqual({
    words: "member-card",
    source: "class",
  });
  expect(nameHintOf("div", { class: "flex p-4 hover:bg-x w-[3px] text-sm" })).toEqual({ words: "Item", source: "tag" });
});

test("tag nouns", () => {
  const noun = (tag: string, attrs: Record<string, string> = {}) => nameHintOf(tag, attrs)!.words;
  expect(noun("tr")).toBe("Row");
  expect(noun("div", { role: "listitem" })).toBe("Row");
  expect(noun("div", { role: "row" })).toBe("Row");
  expect(noun("article")).toBe("Card");
  expect(noun("section")).toBe("Section");
  expect(noun("a")).toBe("Link");
  expect(noun("ol")).toBe("List");
  expect(noun("label")).toBe("Field");
  expect(noun("span")).toBe("Item");
});

test("fieldOf trims and drops empty values", () => {
  expect(fieldOf({ "data-markswift-field": "  title " })).toBe("title");
  expect(fieldOf({ "data-markswift-field": "  " })).toBeUndefined();
  expect(fieldOf({})).toBeUndefined();
});
