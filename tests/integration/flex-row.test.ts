import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

// Admitted at 390 (single-line content bases, the row fits and grows); at 320 Chrome clamps the long word at its
// min-content, which the solver does not model, so the probe demotes the row.
const HTML =
  '<main data-markswift-root style="padding:16px"><div style="display:flex;gap:8px">' +
  '<span style="flex:1 1 auto;padding:0 12px">Supercalifragilisticexpialidocious</span>' +
  '<span style="flex:1 1 auto;padding:0 12px">Short</span></div></main>';

browserTest(
  "the probe capture demotes a flex row the solver reproduces only at the captured width",
  async () => {
    const options = { name: "ProbeRow", mode: "app", theme: "light", viewport: { width: 390, height: 800 } } as const;
    const unprobed = await convertHtml(HTML, { ...options, probe: false });
    expect(unprobed.code).toContain("MarkswiftFlexRow(");
    const probed = await convertHtml(HTML, options);
    expect(probed.code).not.toContain("MarkswiftFlexRow(");
    // The probe's root width: the 320px viewport less the default body margin.
    expect(probed.diagnostics.flatMap((d) => d.diagnostics.map((x) => x.message))).toContain(
      "flex allocation not reproduced at the 304px probe; captured widths pinned",
    );
  },
  60000,
);

// core-alpha's CSS cases (tests/integration/allocated-layout.test.ts: #grow, #shrink, #partial) plus a percentage
// basis: admitted at 390 and kept by the 320 probe, so the solver matches Chrome at both widths.
const CSS = `body{margin:0}*{box-sizing:border-box}main{padding:16px;font:16px/20px "Courier New",monospace}
section{display:flex;align-items:stretch;gap:12px;margin-bottom:12px}article{min-width:0;word-break:break-all}
#grow article{flex:1 1 0%}#grow article:nth-child(2){flex-grow:2;max-width:130px}
#shrink article{flex:0 1 160px;padding:4px;border:1px solid black}#shrink article:nth-child(2){flex-shrink:2;min-width:88px}
#partial article{flex:0.25 1 40px}
#percent article:nth-child(1){flex:0 1 25%;border:1px solid black}#percent article:nth-child(2){flex:1 1 0%}`;
const ROWS = Object.entries({ grow: 3, shrink: 3, partial: 3, percent: 2 })
  .map(
    ([id, n]) =>
      `<section id="${id}">${[32, 44, 52]
        .slice(0, n)
        .map((m) => `<article>${"M".repeat(m)}</article>`)
        .join("")}</section>`,
  )
  .join("");

browserTest(
  "the CSS freeze loop reproduces max-width, min-width, inner-basis shrink, factor sums below 1 and % bases at 390 and 320",
  async () => {
    const result = await convertHtml(`<main data-markswift-root>${ROWS}</main>`, {
      name: "FreezeRows",
      mode: "app",
      theme: "light",
      css: CSS,
      viewport: { width: 390, height: 800 },
    });
    expect(result.code.match(/MarkswiftFlexRow\(items/g)).toHaveLength(4);
    expect(result.code).toContain("max: 130.0");
    expect(result.code).toContain("min: 88.0, inset: 10.0");
    expect(result.code).toContain("fraction: 0.25");
    expect(result.diagnostics.flatMap((d) => d.diagnostics.map((x) => x.message)).join("\n")).not.toContain("probe");
  },
  60000,
);
