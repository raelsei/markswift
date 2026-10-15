/** Plan 052: each LayoutDoc 4 rider read end to end from Chrome's computed serialisation. */
import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "unicode-bidi: an author override and a bdi isolate become Unicode controls",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><p>a <span style="unicode-bidi:bidi-override;direction:rtl">rev</span> b <bdi>iso</bdi></p></main>`,
      { mode: "app", theme: "light", viewport: { width: 390, height: 800 } },
    );
    expect(result.code).toContain(String.raw`\u{202e}rev\u{202c}`);
    expect(result.code).toContain(String.raw`\u{2066}iso\u{2069}`);
  },
  30_000,
);

browserTest(
  "font-stretch: condensed on system-ui is SF's nearest width, reported",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><p style="font:16px system-ui;font-stretch:condensed">x</p></main>`,
      { mode: "app", theme: "light", viewport: { width: 390, height: 800 } },
    );
    expect(result.code).toContain(".width(Font.Width(-0.1))");
    expect(result.diagnostics.flatMap((n) => n.diagnostics.map((d) => d.feature))).toContain("font-stretch");
  },
  30_000,
);

browserTest(
  "color-scheme: a root naming one scheme forces it; light dark does not",
  async () => {
    const convert = (css: string) =>
      convertHtml(`<main data-markswift-root><p>x</p></main>`, {
        css,
        theme: "light",
        viewport: { width: 390, height: 800 },
      });
    expect((await convert(":root{color-scheme:dark}")).code).toContain(String.raw`.environment(\.colorScheme, .dark)`);
    expect((await convert(":root{color-scheme:light dark}")).code).not.toContain(
      String.raw`.environment(\.colorScheme`,
    );
  },
  30_000,
);
