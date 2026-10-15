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

browserTest(
  "pointer-events: none on a veil over a button lets the tap through in app mode",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><div class="stage"><button type="button" class="btn">Continue</button><div class="veil"></div></div></main>`,
      {
        css: ".stage{position:relative;padding:16px}.btn{border:0;font:inherit;padding:8px 16px}.veil{position:absolute;inset:0;background:rgba(37,99,235,.15);pointer-events:none}",
        mode: "app",
        theme: "light",
        viewport: { width: 390, height: 800 },
      },
    );
    expect(result.code.split(".allowsHitTesting(false)").length - 1).toBe(1);
  },
  30_000,
);

browserTest(
  "fill-rule: a stylesheet evenodd fills the donut even-odd",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root><svg viewBox="0 0 10 10" width="10" height="10"><path class="h" d="M0 0h10v10H0zM2 2h6v6H2z"/></svg></main>`,
      { css: ".h{fill:red;fill-rule:evenodd}", theme: "light", viewport: { width: 390, height: 800 } },
    );
    expect(result.code).toContain("FillStyle(eoFill: true)");
  },
  30_000,
);
