import { expect, test } from "bun:test";
import { join } from "node:path";
import { convert } from "../../src/index.ts";
import { isActivatableRole } from "../../src/model/interactive.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const DIR = join(import.meta.dir, "../conformance/fixtures/components");
/** The paint keys the emitter can draw as a state look. */
const DRAWN =
  /^(background-color|color|-webkit-text-fill-color|border-\w+-color|box-shadow|outline-color|opacity|scale|transform)$/;
const PRESS_TYPES = ["submit", "reset", "button", "file"];
const TEXT_TYPES = ["text", "email", "tel", "url", "number", "search", "password"];

/** `PRESSABLE_SELECTOR` / `TEXT_ENTRY_SELECTOR` on a captured node; disabled elements are never owners. */
function owner(n: LayoutNode, state: "pressed" | "focused"): boolean {
  if (n.attrs["disabled"] !== undefined || n.attrs["aria-disabled"] === "true") return false;
  const type = n.attrs["type"]?.toLowerCase();
  if (state === "focused")
    return n.tag === "textarea" || (n.tag === "input" && (type === undefined || TEXT_TYPES.includes(type)));
  return (
    n.tag === "button" ||
    (n.tag === "a" && n.attrs["href"] !== undefined) ||
    n.attrs["onclick"] !== undefined ||
    (n.tag === "input" && type !== undefined && PRESS_TYPES.includes(type)) ||
    isActivatableRole(n.attrs["role"])
  );
}

const drawn = (n: LayoutNode, state: "pressed" | "focused"): boolean =>
  Object.keys(n.states?.[state] ?? {}).some((k) => DRAWN.test(k)) || n.children.some((c) => drawn(c, state));

function owners(n: LayoutNode, state: "pressed" | "focused"): number {
  return (owner(n, state) && drawn(n, state) ? 1 : 0) + n.children.reduce((sum, c) => sum + owners(c, state), 0);
}

for (const [fixture, state, decl] of [
  ["shadcn-button.html", "pressed", "@MarkswiftPressed private var"],
  ["shadcn-input.html", "focused", "@MarkswiftFocused private var"],
] as const) {
  browserTest(
    `${fixture} gets a ${state} member for at least 90% of the elements that restyle`,
    async () => {
      const result = await convert(
        { file: join(DIR, fixture) },
        { name: "States", mode: "app", theme: "light", browserChannel: "chromium" },
      );
      const n = owners(result.layout.root, state);
      const m = result.code.split(decl).length - 1;
      console.log(`029 ${fixture} ${state}: M/N = ${m}/${n}`);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(m).toBeGreaterThanOrEqual(0.9 * n);
    },
    120000,
  );
}
