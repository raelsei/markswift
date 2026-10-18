import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

const SVG = (body: string, size: number) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E${body}%3C/svg%3E`;

// Built from an RLayoutDoc4 probe page: every LD4 field a 2.0 consumer reads.
const HTML = `<style>
body { margin: 0; font: 16px/24px Helvetica, Arial, sans-serif; }
#ph::placeholder { color: rgb(200, 0, 0); font-style: italic; }
#grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 40px auto; grid-auto-rows: 30px; grid-template-areas: "a a b" "c d d"; justify-items: start; gap: 4px; width: 300px; }
#g1 { grid-column: span 2; grid-row: 1 / 3; justify-self: end; }
#g2 { grid-area: b; }
table { table-layout: fixed; border-collapse: separate; border-spacing: 3px 5px; empty-cells: hide; width: 300px; }
#rel { position: relative; top: 10%; left: 7px; right: auto; }
#relb { position: sticky; top: 0; }
ul { list-style: square inside url("${SVG("%3Crect width='8' height='8' fill='red'/%3E", 8)}"); }
#pic::before { content: url("${SVG("%3Ccircle r='5' cx='5' cy='5'/%3E", 10)}") " x"; }
#var { font-variation-settings: "wght" 650, "wdth" 80; }
#cs { color-scheme: dark; }
#z { position: relative; z-index: 3; pointer-events: none; }
.steps { counter-reset: step; list-style: none; }
.steps li { counter-increment: step; }
.steps li::before { display: flex; content: counter(step); }
</style>
<main data-markswift-root>
<input id="ph" placeholder="Search">
<textarea id="ta" placeholder="Note"></textarea>
<input id="plain">
<div id="grid"><div id="g1">1</div><div id="g2">2</div><div>3</div><div>4</div></div>
<table id="table"><tr><td colspan="2">a</td><td rowspan="2">b</td></tr><tr><td></td><td>d</td></tr></table>
<div id="rel">rel</div><div id="relb">sticky</div>
<ul id="list"><li>one</li><li>two</li></ul>
<p id="pic">pic</p>
<p><q id="q">quoted</q></p>
<ol class="steps" id="steps"><li>step</li></ol>
<p id="var">var</p><div id="cs">cs</div><div id="z">z</div>
<dialog id="dlg"><p>dialog body</p></dialog>
<script>document.getElementById("dlg").showModal()</script>
</main>`;

browserTest(
  "LayoutDoc 4 records the 2.0 capture facts",
  async () => {
    const { layout } = await convertHtml(HTML, { theme: "light", viewport: { width: 390, height: 800 } });
    expect(layout.version).toBe(4);
    expect(layout.conditions).toEqual([]);
    expect(layout.viewport.w).toBe(390);

    const byId = new Map<string, LayoutNode>();
    const elements: LayoutNode[] = [];
    const walk = (n: LayoutNode) => {
      if (n.attrs.id) byId.set(n.attrs.id, n);
      if (!n.tag.startsWith("#") && !n.tag.startsWith("::")) elements.push(n);
      // Pseudo-element subtrees hold generated nodes (img children have no computed styles).
      if (!n.tag.startsWith("::")) n.children.forEach(walk);
    };
    walk(layout.root);
    const node = (id: string) => byId.get(id)!;
    const pseudo = (n: LayoutNode, tag: string) => n.children.find((c) => c.tag === tag)!;

    expect(node("g1").styles["grid-column-start"]).toBe("span 2");
    expect(node("g1").styles["grid-row-end"]).toBe("3");
    expect(node("g1").styles["justify-self"]).toBe("end");
    expect(node("g2").styles["grid-column-start"]).toBe("b");
    expect(node("grid").styles["grid-template-areas"]).toBe('"a a b" "c d d"');
    expect(node("grid").styles["grid-auto-rows"]).toBe("30px");

    expect(node("table").styles["border-spacing"]).toBe("3px 5px");
    expect(node("table").styles["table-layout"]).toBe("fixed");
    expect(node("table").styles["empty-cells"]).toBe("hide");
    expect(node("table").styles["border-collapse"]).toBe("separate");

    expect(node("rel").preferredSize?.insets).toEqual({ top: "10%", right: "auto", bottom: "auto", left: "7px" });
    expect(node("relb").preferredSize?.insets?.top).toBe("0px");

    expect(node("ph").pseudoStyles?.placeholder?.color).toBe("rgb(200, 0, 0)");
    expect(node("ph").pseudoStyles?.placeholder?.["font-style"]).toBe("italic");
    expect(node("ta").pseudoStyles?.placeholder?.color).toBe("rgb(117, 117, 117)");
    expect(node("plain").pseudoStyles).toBeUndefined();

    const pic = pseudo(node("pic"), "::before");
    expect(pic.children.map((c) => c.tag)).toEqual(["img", "#text"]);
    expect(pic.children[0]!.bounds.w).toBe(10);
    expect(pic.children[0]!.bounds.h).toBe(10);
    expect(pic.children[0]!.currentSrc).toStartWith("data:image/svg+xml");
    const marker = pseudo(node("list").children[0]!, "::marker");
    expect(marker.children.map((c) => [c.tag, c.bounds.w, c.bounds.h])).toEqual([["img", 8, 8]]);

    for (const tag of ["::before", "::after"])
      expect(pseudo(node("q"), tag).children.some((c) => c.tag === "img")).toBe(false);
    expect(pseudo(node("steps").children[0]!, "::before").children.some((c) => c.tag === "img")).toBe(false);

    expect(node("var").styles["font-variation-settings"]).toContain('"wght" 650');
    for (const e of elements) expect(typeof e.styles["unicode-bidi"]).toBe("string");
    expect(node("cs").styles["color-scheme"]).toBe("dark");
    expect(node("z").styles["pointer-events"]).toBe("none");
    expect(node("dlg").styles["overlay"]).toBe("auto");
  },
  30_000,
);
