import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "plaintext, isolated counters and disclosure markers survive native emission",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root style="width:300px;font:16px/24px system-ui">
    <p dir="rtl" style="unicode-bidi:plaintext;white-space:pre-wrap">English.\nעברית.</p>
    <ol style="list-style-position:inside"><li>English עברית</li><li>עברית English</li></ol>
    <details><summary>More עברית</summary><p>Answer</p></details>
  </main>`,
      { name: "BidiRiders", theme: "light" },
    );
    expect(result.code).not.toContain("Text.markswiftRTL");
    expect(result.code).toContain("\\u{2066}");
    expect(result.code).toMatch(/Text\(verbatim: isMore\w*Expanded \? "\\u\{2066\}▾ \\u\{2069\}"/);
    const dir = await mkdtemp(join(tmpdir(), "markswift-bidi-riders-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const compiled = compileLayout(result.layout, { name: "Riders", mode });
        const out = join(dir, mode);
        for (const [file, content] of Object.entries(compiled.files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

browserTest(
  "pass-through descendants use live hit bounds and silent transparent controls keep their action",
  async () => {
    const result = await convertHtml(
      `<main data-markswift-root style="position:relative;width:300px;height:200px">
    <button>Underneath</button>
    <div style="position:absolute;inset:0;pointer-events:none;background:#ddd8"><button id="live" style="pointer-events:auto;float:right">Live</button></div>
    <button aria-hidden="true" id="hidden" style="opacity:0">Hidden</button>
  </main>`,
      { name: "PointerRiders", theme: "light" },
    );
    expect(result.code).toContain('.markswiftHitTarget("#live")');
    expect(result.code).toContain('targets: ["#live"]');
    expect(result.code).toContain("onHidden");
    expect(result.code).toContain(".opacity(0.0)");
    expect(result.code).toContain(".accessibilityHidden(true)");
    const dir = await mkdtemp(join(tmpdir(), "markswift-pointer-riders-"));
    try {
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(dir, file), content);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
