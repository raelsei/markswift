import { expect, test } from "bun:test";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";
import type { TextNode } from "../../src/model/semantic.ts";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const OPTIONS = { name: "RelativeView", theme: "light", viewport: { width: 390, height: 800 } } as const;

browserTest(
  "relative boxes keep their flow slot and draw at .offset",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root style="width:300px;padding:10px;font:15px/20px system-ui"><div id="a" style="height:20px;background:#ddd"></div><div id="r" style="position:relative;top:7px;left:10%;height:20px;background:#00f"><i id="k" style="position:absolute;top:0;left:0;width:5px;height:5px;background:#f00"></i></div><div id="b" style="height:20px;background:#ddd"></div><div id="t" style="position:relative;top:10%;height:20px"></div><div id="s" style="position:sticky;top:0;height:20px"></div><p style="margin:0">a <span id="sp" style="position:relative;top:-4px">b</span> c</p></main>`,
      OPTIONS,
    );
    const byId = new Map<string, LayoutNode>();
    const walk = (n: LayoutNode) => {
      if (n.attrs.id) byId.set(n.attrs.id, n);
      n.children.forEach(walk);
    };
    walk(result.layout.root);
    const r = byId.get("r")!;
    expect(r.bounds).toEqual({ x: 10, y: 30, w: 300, h: 20 });
    expect(byId.get("k")!.bounds).toMatchObject({ x: 10, y: 30 });
    expect(byId.get("b")!.bounds.y).toBe(50);
    expect(r.preferredSize?.insets).toEqual({ top: "7px", right: "auto", bottom: "auto", left: "10%" });
    expect(result.code.split(".offset(x: 30.0, y: 7.0)").length - 1).toBe(1);
    expect(result.code).toContain(".customAttribute(MarkswiftTextOffset(x: 0.0, y: -4.0))");
    const messages = result.diagnostics.flatMap((d) => d.diagnostics).map((d) => d.message);
    for (const m of ["relative percentage insets → offset pinned at (30, 7)px", "position: sticky (snapshot position)"])
      expect(messages).toContain(m);
  },
  60_000,
);

browserTest.each([true, false])(
  "a float lift preserves bare or wrapped text and does not repeat the host's offset (wrapped: %s)",
  async (wrapped) => {
    const text = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt";
    const result = await convertHtml(
      `<main data-markswift-root style="width:200px;font:15px/20px system-ui"><div id="h" style="position:relative;top:5px"><div style="float:left;width:60px;height:40px;background:#0a0"></div>${wrapped ? `<p style="margin:0">${text}</p>` : text}</div></main>`,
      OPTIONS,
    );
    const messages = result.diagnostics.flatMap((d) => d.diagnostics).map((d) => d.message);
    expect(messages).toContain(
      "float → row plus the lines that clear it; re-wrapped at another width the split lands elsewhere",
    );
    expect(result.code.split(".offset(x: 0.0, y: 5.0)").length - 1).toBe(1);
  },
  60_000,
);

for (const side of ["left", "right"] as const) {
  browserTest(
    `bare text clears a ${side} float without losing words or the available widths`,
    async () => {
      const text = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt";
      const result = await convertHtml(
        `<main data-markswift-root style="width:200px;padding:10px;font:15px/20px system-ui"><div style="float:${side};width:60px;height:40px;background:red"></div>${text}</main>`,
        OPTIONS,
      );
      const texts: TextNode[] = [];
      visit(inferScreen(result.layout, "Float").root, (n) => {
        if (n.kind === "text") texts.push(n);
      });
      expect(texts).toHaveLength(2);
      const [beside, cleared] = texts;
      expect(beside!.frame.w).toBe(140);
      expect(cleared!.frame.w).toBe(200);
      expect(cleared!.frame.y).toBe(50);
      expect(texts.map((n) => n.runs.map((r) => r.text).join("")).join(" ")).toBe(text);
      expect(beside!.lines).toBe(2);
      expect(cleared!.lines).toBeGreaterThan(0);
    },
    60_000,
  );
}

browserTest(
  "nested inline and generated text offsets preserve flow and add only their own translation",
  async () => {
    const result = await convertHtml(
      `<style>
    main { width: 300px; font: 16px/24px system-ui }
    p { margin: 0; height: 80px; position: relative; top: 3px }
    span { position: relative; left: 7px; top: 5px }
    b { position: relative; left: -2px; top: -1px }
    p::before { content: "before"; position: relative; left: 11px; top: 10% }
    p::after { content: "after"; position: relative; right: 4px; bottom: 6px }
  </style><main data-markswift-root><p>start <span>outer <b>inner</b></span> end</p></main>`,
      OPTIONS,
    );
    for (const pair of ["7.0, y: 5.0", "5.0, y: 4.0", "11.0, y: 8.0", "-4.0, y: -6.0"])
      expect(result.code).toContain(`MarkswiftTextOffset(x: ${pair})`);
    expect(result.code.match(/\.offset\(x: 0.0, y: 3.0\)/g)).toHaveLength(1);
  },
  60_000,
);
