import { expect, test } from "bun:test";
import { HTML_ELEMENTS, classifyElement, INPUT_CONTROLS } from "../../../src/html/index.ts";
import { controlOf } from "../../../src/analysis/controls.ts";
import { isInlineText } from "../../../src/analysis/text-runs.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

// Independent snapshot of the WHATWG element index, including the two foreign roots.
// https://html.spec.whatwg.org/multipage/indices.html — checked 2026-09-16.
const STANDARD_ELEMENTS = `a abbr address area article aside audio b base bdi bdo blockquote body br
button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em
embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe
img input ins kbd label legend li link main map mark math menu meta meter nav noscript object ol
optgroup option output p picture pre progress q rp rt ruby s samp script search section select
selectedcontent slot small source span strong style sub summary sup svg table tbody td template
textarea tfoot th thead time title tr track u ul var video wbr`.split(/\s+/);

function element(tag: string, attrs: Record<string, string> = {}): LayoutNode {
  return { tag, attrs, styles: { display: "inline" }, bounds: { x: 0, y: 0, w: 80, h: 20 }, children: [] };
}

test("every standard element has an explicit compiler policy", () => {
  expect(Object.keys(HTML_ELEMENTS).sort()).toEqual(STANDARD_ELEMENTS.sort());
  for (const tag of STANDARD_ELEMENTS) {
    const policy = classifyElement(tag);
    expect(policy.known).toBe(true);
    expect(policy.route).toBeDefined();
    if (policy.support === "unsupported" || policy.support === "approximated") {
      expect(policy.diagnostic).toBeTruthy();
      expect(policy.diagnostic!.message).toContain(tag);
      expect(policy.diagnostic!.feature).toBe(tag);
    }
  }
});

test("native input selection and element classification share the same input table", () => {
  expect(Object.keys(INPUT_CONTROLS).sort()).toEqual(
    `button checkbox color date datetime-local email file month number password radio range reset search submit tel text time url week`
      .split(" ")
      .sort(),
  );
  for (const [type, kind] of Object.entries(INPUT_CONTROLS)) {
    expect(controlOf(element("input", { type }))?.control).toBe(kind);
    expect(classifyElement("input", { type }).route).toBe("control");
  }
  expect(classifyElement("input", { type: "image" }).route).toBe("placeholder");
  expect(controlOf(element("input", { type: "not-a-type" }))?.control).toBe("textField");
  expect(controlOf(element("input", { type: "constructor" }))?.control).toBe("textField");
});

test("atomic and unsupported inline elements cannot disappear inside text runs", () => {
  for (const tag of ["canvas", "iframe", "embed", "object", "math", "video", "audio", "ruby", "rt"]) {
    expect(isInlineText(element(tag))).toBe(false);
  }
  expect(isInlineText(element("a", { href: "https://example.com" }))).toBe(true);
  expect(isInlineText(element("a"))).toBe(true);
  expect(isInlineText(element("strong"))).toBe(true);
});

test("unknown and custom elements keep measured layout and report the fallback", () => {
  for (const tag of ["profile-card", "madeup", "constructor", "__proto__"]) {
    const policy = classifyElement(tag);
    expect(policy.known).toBe(false);
    expect(policy.route).toBe("flow");
    expect(policy.support).toBe("approximated");
    expect(policy.diagnostic!.message).toContain(tag);
    expect(isInlineText(element(tag))).toBe(false);
  }
});
