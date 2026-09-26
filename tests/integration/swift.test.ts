import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { TYPECHECK_TARGET, typecheck } from "../../tools/verify/typecheck.ts";

const nativeTest = (process.env.MARKSWIFT_SWIFT_TESTS ?? process.env.H2S_SWIFT_TESTS) === "1" ? test : test.skip;

nativeTest("public conversion produces complete Swift compilable in both modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-native-api-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml('<main data-h2s-root><h2>Hello</h2><label>Name<input value="Ada"></label><button>Save</button><input type="submit" value="send" style="text-transform:uppercase"><p>Visit <a href="https://example.com">our site</a> today.</p><a style="display:block" href="https://example.com">Open site</a><section style="max-width:50%;padding:4px"><p style="min-height:30px">Floor</p><p style="max-height:10px;overflow:hidden">Clipped</p><span style="display:inline-block;max-width:200px">Hi</span></section><svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="red"/></svg></main>', {
        name: "ExampleCard", mode,
        css: "body{margin:0} main{width:300px;padding:20px;font:16px system-ui;background:#eee} h2{font-size:24px}label{display:block}",
      });
      expect(result.code).toContain("Link(destination:");
      expect(result.code).toContain('Text.markswiftLink("our site", "https://example.com/")');
      expect(result.code).toContain("minHeight: 30.0");
      expect(result.code).toContain("height: 10.0, alignment: .topLeading");
      expect(result.code).toContain("maxWidth: 200.0");
      expect(result.diagnostics.flatMap(item => item.notes).join("\n")).not.toContain("destination dropped");
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const check = await typecheck(output);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
      const isolated = await typecheck(output, { ...TYPECHECK_TARGET, defaultIsolationMainActor: true });
      if (!isolated.ok) throw new Error(isolated.output);
      expect(isolated.ok).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
