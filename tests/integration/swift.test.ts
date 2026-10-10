import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest("public conversion produces complete Swift compilable in both modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-native-api-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml('<main data-markswift-root><h2>Hello</h2><label>Name<input value="Ada"></label><button>Save</button><p>Visit <a href="https://example.com">our site</a> today.</p><a style="display:block" href="https://example.com">Open site</a><section style="max-width:50%;padding:4px"><p style="min-height:30px">Floor</p><p style="max-height:10px;overflow:hidden">Clipped</p><span style="display:inline-block;max-width:200px">Hi</span></section><svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="red"/></svg></main>', {
        name: "ExampleCard", mode,
        css: "body{margin:0} main{width:300px;padding:20px;font:16px system-ui;background:#eee} h2{font-size:24px}label{display:block}",
      });
      expect(result.code).toContain("Link(destination:");
      expect(result.code).toContain("minHeight: 30.0");
      expect(result.code).toContain("height: 10.0, alignment: .topLeading");
      expect(result.code).toContain("maxWidth: 200.0");
      expect(result.diagnostics.flatMap(item => item.notes).join("\n")).toContain("destination dropped");
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const check = await typecheck(output);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);

nativeTest("adaptive light/dark conversion compiles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-native-adaptive-"));
  try {
    const result = await convertHtml('<main data-markswift-root><h2>Account</h2><p class="note">Signed in</p><progress value="40" max="100"></progress></main>', {
      name: "AdaptiveCard",
      css: "body{margin:0} main{width:280px;padding:16px;font:16px system-ui;background:#fff;color:#111} .note{color:#555} @media (prefers-color-scheme: dark){main{background:#16181d;color:#f2f2f2}.note{color:#a0a4ab}}",
    });
    expect(result.files["AdaptiveCard+Tokens.swift"]).toContain("= Color.markswift(light:");
    expect(result.code).toContain("Color.markswift(light: Color.markswift(");
    for (const [file, content] of Object.entries(result.files)) await Bun.write(join(directory, file), content);
    const check = await typecheck(directory);
    if (!check.ok) throw new Error(check.output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);

const ASSETS = join(import.meta.dir, "../conformance/fixtures/assets");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SHARED = '<div style="width:40px;height:20px;background:var(--primary)"></div><div style="width:40px;height:20px;background:var(--primary)"></div><svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 2h16v16H2z" fill="#16a34a"/></svg>';
const EFFECTS = [
  "filter:blur(2px)", "filter:brightness(1.2) contrast(1.1) saturate(.5) hue-rotate(45deg)", "filter:invert(1)", "filter:sepia(.6)",
  "filter:drop-shadow(2px 2px 2px #0008)", "mix-blend-mode:multiply", "background:#fff8;backdrop-filter:blur(4px)",
  "clip-path:polygon(50% 0,100% 100%,0 100%)", "mask-image:linear-gradient(#000,transparent)", "transform:rotate(12deg) scale(.9)",
  "box-shadow:inset 0 2px 4px #0006,0 4px 8px #0004;border-radius:8px",
];
/**
 * One bundle per emitter family. `app` markers prove the family reached its emitter (checked in
 * app mode only: fidelity paints controls statically); a marker ending in `.swift` is a file name.
 */
const FAMILIES: Array<{ name: string; html: string; css?: string; assetsDir?: string; app: string[] }> = [
  {
    name: "EffectsFamily",
    html: EFFECTS.map((s) => `<div style="width:40px;height:40px;background:#e11d48;${s}"></div>`).join(""),
    css: "main{display:flex;flex-wrap:wrap;gap:8px;padding:8px}",
    app: [".colorInvert()", ".hueRotation(", ".blendMode(", "MarkswiftClip_"],
  },
  {
    name: "ControlsFamily",
    html: '<input type="text" placeholder="Name"><input type="checkbox" checked><input type="radio" name="r" checked><input type="range" value="30"><input type="date" value="2026-10-10"><input type="color" value="#2563eb"><input type="file"><input type="number" value="3"><select><option>One</option><option selected>Two</option></select><textarea>Notes</textarea><progress value="40" max="100"></progress><meter value="0.6"></meter><details open><summary>More</summary><p>Body</p></details><button>Save</button><a href="https://example.com">Link</a>',
    css: "main{display:flex;flex-direction:column;gap:6px;padding:8px}",
    app: ["Slider(", "DatePicker(", "ColorPicker(", "TextEditor(", "DisclosureGroup(", ".fileImporter(", "Link(destination:"],
  },
  {
    name: "SvgFamily",
    html: '<svg width="160" height="80" viewBox="0 0 160 80"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#e11d48"/></linearGradient><radialGradient id="rg"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><clipPath id="cp"><circle cx="120" cy="40" r="30"/></clipPath></defs><rect width="80" height="80" fill="url(#lg)"/><rect x="80" width="80" height="80" fill="url(#rg)" clip-path="url(#cp)"/><text x="4" y="70" font-size="12">SVG</text></svg>',
    app: ["LinearGradient(", "RadialGradient(", "MarkswiftShape_"],
  },
  {
    name: "ImageFamily",
    html: `<img style="width:40px;height:40px" src="${PNG}"><img style="width:40px;height:40px" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='4' fill='red'/></svg>"><div style="width:120px;height:40px;background:url(${PNG}) repeat;background-size:8px 8px"></div>`,
    app: ["Image.markswiftAsset("],
  },
  {
    name: "WebfontFamily", assetsDir: ASSETS,
    html: "<p>Geist text</p>",
    css: '@font-face{font-family:Geist;src:url(geist-latin-wght-normal.woff2) format("woff2");font-weight:100 900} main{font-family:Geist}',
    app: ["WebfontFamily+Fonts.swift", '.custom("Geist"'],
  },
  {
    name: "EscapesFamily",
    html: '<pre>a\u000bb</pre><img alt="x\u0001y" src="missing.png" style="width:60px;height:20px"><input placeholder="p\u000cq">',
    app: ["\\u{b}", "\\u{c}"],
  },
  // Identical sources: identical token names and shape hashes in two views of one target.
  { name: "CoexistA", html: SHARED, app: ["Palette.primary", "MarkswiftShape_"] },
  { name: "CoexistB", html: SHARED, app: ["Palette.primary", "MarkswiftShape_"] },
];

for (const mode of ["app", "fidelity"] as const) {
  nativeTest(`every emitter family compiles, all bundles in one target (${mode})`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `markswift-native-matrix-${mode}-`));
    try {
      let runtime: string | undefined;
      for (const f of FAMILIES) {
        const result = await convert({ html: `<main data-markswift-root>${f.html}</main>`, ...(f.assetsDir ? { assetsDir: f.assetsDir } : {}) }, {
          name: f.name, mode, css: `body{margin:0} :root{--primary:#2563eb} main{width:320px;font:16px system-ui} ${f.css ?? ""}`,
        });
        if (mode === "app") {
          const all = Object.values(result.files).join("\n");
          for (const marker of f.app) {
            if (marker.endsWith(".swift")) expect(Object.keys(result.files)).toContain(marker);
            else expect(all).toContain(marker);
          }
        }
        for (const [file, content] of Object.entries(result.files)) {
          if (file === "MarkswiftRuntime.swift") { runtime ??= content; expect(content).toBe(runtime); }
          else expect(await Bun.file(join(directory, file)).exists()).toBe(false);
          await Bun.write(join(directory, file), content);
        }
      }
      const check = await typecheck(directory);
      if (!check.ok) throw new Error(check.output);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 300000);
}
