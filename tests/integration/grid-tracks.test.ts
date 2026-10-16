import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "capture records the authored grid-template-columns and explicit grid-template-rows",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><div id="a" style="display:grid;grid-template-columns:1fr 2fr"><i>1</i><i>2</i></div><div id="b" style="display:grid;grid-template-columns:100px 100px;grid-template-rows:40px"><i>1</i><i>2</i></div></main>`,
      { theme: "light", viewport: { width: 390, height: 800 } },
    );
    const byId = new Map<string, LayoutNode>();
    const walk = (n: LayoutNode) => {
      if (n.attrs.id) byId.set(n.attrs.id, n);
      n.children.forEach(walk);
    };
    walk(result.layout.root);
    expect(byId.get("a")!.preferredSize?.gridTemplateColumns).toBe("1fr 2fr");
    expect(byId.get("a")!.preferredSize?.gridTemplateRows).toBeUndefined();
    expect(byId.get("b")!.preferredSize?.gridTemplateRows).toBe("40px");
  },
  30_000,
);

// core-alpha's #minimum (tests/integration/allocated-layout.test.ts): at 390 the 1fr share (≈90px) is below its 100px
// floor; at the 320 probe too. Admitted and kept, the solver matches Chrome at both widths.
browserTest(
  "a minmax(px, fr) floor is admitted and kept by the probe",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root style="padding:16px"><div style="display:grid;gap:12px;grid-template-columns:64px minmax(100px,1fr) minmax(0,2fr)"><i>1</i><i>2</i><i>3</i></div></main>`,
      { name: "MinimumGrid", mode: "app", theme: "light", viewport: { width: 390, height: 800 } },
    );
    expect(result.code).toContain("MarkswiftTracks(tracks: [.px(64.0), .fr(1.0, min: 100.0), .fr(2.0)]");
  },
  60_000,
);

const count = (code: string, needle: string) => code.split(needle).length - 1;
const gridNotes = (r: Awaited<ReturnType<typeof convertHtml>>) =>
  r.diagnostics.flatMap((d) => d.diagnostics).filter((d) => d.feature === "display: grid");

browserTest(
  "the grid-placement fixture admits all five placed grids",
  async () => {
    const result = await convertHtml(
      await Bun.file("tests/conformance/fixtures/css-layout/grid-placement.html").text(),
      { name: "GridPlacement", mode: "app", theme: "light", viewport: { width: 390, height: 800 } },
    );
    expect(count(result.code, "MarkswiftTracks(")).toBe(5);
    for (const s of [
      ".markswiftGridCell(column: 1, row: 1, columnSpan: 2)",
      "justify: .end",
      "justify: .center",
      "autoRow: .px(36.0)",
    ])
      expect(result.code).toContain(s);
    expect(result.code).not.toContain("MarkswiftMeasuredLayout(");
    expect(gridNotes(result)).toEqual([]);
  },
  60_000,
);

browserTest(
  "shadcn CardHeader actions and Alert icons lay out through MarkswiftTracks",
  async () => {
    const convert = async (file: string, name: string) =>
      convertHtml(await Bun.file(`tests/conformance/fixtures/components/${file}`).text(), {
        name,
        mode: "app",
        theme: "light",
        viewport: { width: 390, height: 800 },
      });
    const card = await convert("shadcn-card.html", "CardView");
    expect(count(card.code, "MarkswiftTracks(tracks: [.fr(1.0), .auto]")).toBe(1);
    expect(card.code).toContain(".markswiftGridCell(column: 2, row: 1, rowSpan: 2, justify: .end)");
    expect(gridNotes(card)).toEqual([]);
    const alert = await convert("shadcn-alert.html", "AlertView");
    expect(count(alert.code, "MarkswiftTracks(tracks: [.fr(1.0)]")).toBe(3);
    expect(gridNotes(alert)).toEqual([]);
  },
  60_000,
);
