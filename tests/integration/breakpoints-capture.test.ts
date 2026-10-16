import { expect, test } from "bun:test";
import { convert, convertHtml } from "../../src/index.ts";
import { matchesWidth, widthQuery } from "../../src/css/index.ts";
import { CSS, HTML } from "../helpers/silent-pins.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

const nodes = (root: LayoutNode): LayoutNode[] => [root, ...root.children.flatMap(nodes)];
const textOf = (n: LayoutNode): string => n.text ?? n.children.map(textOf).join("");

/** The media queries of tests/unit/css/media.test.ts that `widthQuery` reconstructs. */
const ACCEPTED = [
  "(min-width: 640px)",
  "(min-width: 40rem)",
  "(min-width: 48em)",
  "(max-width: 767px)",
  "(width >= 40rem)",
  "(width > 600px)",
  "(width < 1024px)",
  "(width <= 600px)",
  "(640px <= width < 1024px)",
  "(1024px > width >= 640px)",
  "(600px < width)",
  "(600px >= width)",
  "screen and (min-width: 768px)",
  "only screen and (min-width: 768px) and (max-width: 1023px)",
  "(min-width: 600px) and (min-width: 700px)",
  "(max-width: 900px) and (max-width: 800px)",
  "(min-width: 600.5px)",
];

browserTest(
  "widthQuery agrees with Chrome's matchMedia",
  async () => {
    const html = `<main data-markswift-root>${ACCEPTED.map((_, i) => `<p class="t${i}">${i}</p>`).join("")}</main>`;
    const css = ACCEPTED.map((q, i) => `@media ${q} { .t${i} { color: red } }`).join("\n");
    for (const width of [599, 600, 768, 1024]) {
      const { layout } = await convertHtml(html, { css, viewport: { width, height: 400 }, theme: "light" });
      const media = layout.conditions.filter((c) => c.kind === "media");
      expect(media).toHaveLength(ACCEPTED.length);
      for (const c of media) {
        const q = widthQuery(c.query);
        expect({ query: c.query, parsed: q !== undefined }).toEqual({ query: c.query, parsed: true });
        expect({ query: c.query, width, matches: matchesWidth(q!, width) }).toEqual({
          query: c.query,
          width,
          matches: c.matches,
        });
      }
    }
  },
  120000,
);

browserTest(
  "Tailwind's nested sm: query marks the elements it restyles",
  async () => {
    const capture = async (width: number) => {
      const { layout } = await convert(
        { file: "tests/conformance/fixtures/components/shadcn-pagination.html" },
        { viewport: { width, height: 844 }, theme: "light" },
      );
      const i = layout.conditions.findIndex((c) => c.kind === "media" && c.query === "(width >= 40rem)");
      expect(i).toBeGreaterThanOrEqual(0);
      const labels = nodes(layout.root).filter((n) => n.attrs.class === "hidden sm:block");
      return { matches: layout.conditions[i]!.matches, i, labels };
    };
    // At 390 the labels are `display: none` (`hidden`), so not in the tree; `sm:block` shows them from 640.
    const phone = await capture(390);
    expect(phone.matches).toBe(false);
    expect(phone.labels).toEqual([]);
    const tablet = await capture(834);
    expect(tablet.matches).toBe(true);
    expect(tablet.labels.map(textOf).sort()).toEqual(["Next", "Previous"]);
    for (const n of tablet.labels) expect(n.conditional).toContain(tablet.i);
  },
  60000,
);

const MEDIA_QUERY = { file: "tests/conformance/fixtures/css-layout/media-query.html" };
const FLUID = "main[data-markswift-root]{width:auto!important}";

browserTest(
  "breakpoints capture one layout per width band",
  async () => {
    const result = await convert(MEDIA_QUERY, { css: FLUID, theme: "light", breakpoints: true });
    const bands = result.bands!;
    expect(bands.map((b) => b.layout.viewport.w)).toEqual([390, 834]);
    const wide = (n: LayoutNode) => /\bonly-wide\b/.test(n.attrs.class ?? "");
    expect(nodes(bands[0]!.layout.root).some(wide)).toBe(false);
    expect(nodes(bands[1]!.layout.root).some(wide)).toBe(true);
    expect(result.layout).toBe(bands[0]!.layout);
    const plain = await convert(MEDIA_QUERY, { css: FLUID, theme: "light" });
    expect(plain.bands).toBeUndefined();
    // Plan 054 merges the bands into one view; without `breakpoints` the band-0 view is unchanged.
    expect(result.code).toContain("MarkswiftBands(");
    expect(plain.code).not.toContain("MarkswiftBands(");
  },
  120000,
);

browserTest(
  "a band without a device is captured at its lower bound",
  async () => {
    const result = await convert(MEDIA_QUERY, {
      css: FLUID,
      theme: "light",
      breakpoints: { devices: [{ width: 390, height: 844 }], max: 1024 },
    });
    expect(result.bands!.map((b) => b.layout.viewport.w)).toEqual([390, 600]);
  },
  120000,
);

browserTest(
  "adaptive breakpoints capture every band in both themes",
  async () => {
    const result = await convert(MEDIA_QUERY, { css: FLUID, theme: "adaptive", breakpoints: true });
    expect(result.bands).toHaveLength(2);
    for (const b of result.bands!) expect(b.darkLayout?.combo.theme).toBe("dark");
    expect(result.darkLayout).toBe(result.bands![0]!.darkLayout!);
  },
  120000,
);

browserTest(
  "a threshold outside the band range is reported",
  async () => {
    const result = await convertHtml('<main data-markswift-root><p class="x">x</p></main>', {
      css: "@media (min-width: 200px) { .x { color: red } }",
      theme: "light",
      breakpoints: true,
    });
    expect(result.bands).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        feature: "media-query",
        message: expect.stringContaining("outside the 320–1376px band range"),
      }),
    );
  },
  60000,
);

browserTest(
  "container queries add a capture at the top of each band and drop their capture warning",
  async () => {
    const result = await convertHtml(HTML, { css: CSS, theme: "light", breakpoints: true });
    expect(result.bands!.map((b) => b.layout.viewport.w)).toEqual([390, 599, 834, 1376]);
    expect(result.layout).toBe(result.bands![0]!.layout);
    expect(result.warnings.filter((w) => w.source === "capture" && w.feature === "container-query")).toEqual([]);
  },
  120000,
);
