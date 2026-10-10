import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
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
    expect(result.files["MarkswiftTokens.swift"]).toContain("= Color(light:");
    expect(result.code).toContain("Color(light: Color.markswift(");
    for (const [file, content] of Object.entries(result.files)) await Bun.write(join(directory, file), content);
    const check = await typecheck(directory);
    if (!check.ok) throw new Error(check.output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
