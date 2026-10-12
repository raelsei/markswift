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
