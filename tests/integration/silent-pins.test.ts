import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { formatWarning } from "../../src/cli/output.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { CSS, HTML } from "../helpers/silent-pins.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "breakpoints, width and grid pins and baked validation styling are reported",
  async () => {
    const convert = (mode: "app" | "fidelity") =>
      convertHtml(HTML, { name: "SilentPins", css: CSS, mode, theme: "light", viewport: { width: 390, height: 900 } });
    const result = await convert("app");
    const media = result.warnings.find((w) => w.feature === "media-query");
    expect(media).toMatchObject({ source: "capture", level: "approximated", feature: "media-query" });
    expect(media!.message).toContain("@media (min-width: 600px)");
    expect(media!.message).toContain(".split");
    expect(media!.message).toContain(".title");
    expect(result.warnings.find((w) => w.feature === "container-query")?.message).toContain(".inner");
    expect(formatWarning(media!)).toStartWith("approximated media-query: @media (min-width: 600px)");

    const nodes: LayoutNode[] = [];
    const collect = (n: LayoutNode) => {
      nodes.push(n);
      n.children.forEach(collect);
    };
    collect(result.layout.root);
    const byClass = (c: string) => nodes.find((n) => n.attrs.class === c)!;
    const card = byClass("card");
    const { conditions } = result.layout;
    expect(conditions).toHaveLength(2);
    expect(conditions).toContainEqual({ kind: "media", query: "(min-width: 600px)", matches: false });
    expect(conditions).toContainEqual({
      kind: "container",
      query: "(min-width: 400px)",
      container: card.id!,
      matches: false,
    });
    const mediaIndex = conditions.findIndex((c) => c.kind === "media");
    const containerIndex = conditions.findIndex((c) => c.kind === "container");
    expect(byClass("split").conditional).toContain(mediaIndex);
    expect(byClass("title").conditional).toContain(mediaIndex);
    expect(byClass("inner").conditional).toContain(containerIndex);
    expect(card.conditional).toBeUndefined();
    expect(nodes.find((n) => n.attrs.id === "half")!.conditional).toBeUndefined();
    expect(
      nodes.flatMap((n) => Object.keys(n.attrs)).filter((k) => /^data-markswift-(conditional|container)/.test(k)),
    ).toEqual([]);

    const notes = (r: typeof result, id: string) =>
      r.diagnostics
        .filter((d) => d.id === id)
        .flatMap((d) => d.diagnostics)
        .map((d) => `${d.feature}: ${d.message}`)
        .join("\n");
    // The shrunk 150px item sits in an admitted row: app mode reflows it (MarkswiftFlexRow), fidelity pins the row.
    expect(notes(result, "#shrunk")).not.toContain("laid out at");
    expect(result.code).toContain("MarkswiftFlexRow(");
    expect(notes(result, "#email")).toContain(":invalid: ");
    // Its items have a px height, so the auto-fit grid is not admitted and stays pinned in app mode.
    expect(notes(result, "#fit")).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)) pinned at 3 columns",
    );
    // App mode keeps the fraction (MarkswiftFraction); fidelity pins it with the same note.
    expect(notes(result, "#half")).not.toContain("pinned");
    const fidelity = await convert("fidelity");
    expect(notes(fidelity, "#half")).toContain("width: width 50% pinned at 195px");
    expect(fidelity.diagnostics.flatMap((d) => d.diagnostics)).toContainEqual(
      expect.objectContaining({ feature: "flex-shrink", message: expect.stringContaining("shrunk flex items pinned") }),
    );
  },
  60000,
);

browserTest(
  "a colour-scheme media query is not a breakpoint",
  async () => {
    const result = await convertHtml("<main data-markswift-root><p>plain</p></main>", {
      css: "@media (prefers-color-scheme: dark){p{color:white}}",
      theme: "light",
    });
    expect(result.warnings).toEqual([]);
  },
  60000,
);
