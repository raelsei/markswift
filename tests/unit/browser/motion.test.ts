import { expect, test } from "bun:test";
import { attachMotion } from "../../../src/browser/snapshot.ts";
import type { Anim } from "../../../src/model/layout.ts";

type Raw = Parameters<typeof attachMotion>[0];
const el = (name: string, children: Raw[] = [], pseudo?: string): Raw => ({
  idx: 0,
  type: 1,
  name,
  value: "",
  attrs: {},
  styles: {},
  ...(pseudo ? { pseudo } : {}),
  children,
});
const text: Raw = { idx: 0, type: 3, name: "#text", value: "x", attrs: {}, styles: {}, children: [] };
const anim = (name: string, pseudo?: Anim["pseudo"]): Anim => ({
  name,
  ...(pseudo ? { pseudo } : {}),
  duration: 1000,
  delay: 0,
  iterations: "infinite",
  direction: "normal",
  fill: "none",
  keyframes: [],
});

test("attachMotion joins element paths and ::before/::after keys onto the right Raw nodes", () => {
  const before = el("::before", [], "before");
  const after = el("::after", [], "after");
  const target = el("span", [before, text, after]);
  const first = el("div", [el("i")]);
  const root = el("main", [el("style"), el("section", [first, target]), text]);
  attachMotion(root, {
    "1/1": { animations: [anim("spin")] },
    "1/1::after": { animations: [anim("blink", "::after")] },
    "1/0/0": { reduced: [] },
  });
  expect(target.motion).toEqual({ animations: [anim("spin")] });
  expect(after.motion).toEqual({ animations: [anim("blink", "::after")] });
  expect(before.motion).toBeUndefined();
  expect(first.motion).toBeUndefined();
  expect(first.children[0]!.motion).toEqual({ reduced: [] });
  expect(root.motion).toBeUndefined();
});
