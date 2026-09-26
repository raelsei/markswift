import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

browserTest("live empty readonly values preserve browser prompts while filled controls retain their own text", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    const result = await convertHtml(`<main data-markswift-root>
      <input readonly placeholder="Your name"><input readonly type="password" placeholder="Your password">
      <textarea readonly placeholder="Your notes"></textarea>
      <input readonly value="Ada" placeholder="Wrong name"><input readonly type="password" value="secret" placeholder="Wrong password">
      <textarea readonly placeholder="Wrong notes">Filled notes</textarea>
    </main>`, { name: "ReadonlyPrompts", mode });
    for (const prompt of ["Your name", "Your password", "Your notes"]) expect(result.code).toContain(`Text(verbatim: "${prompt}")`);
    for (const value of ["Ada", "••••••", "Filled notes"]) expect(result.code).toContain(`Text(verbatim: "${value}")`);
    expect(result.code).not.toContain("Wrong");
    expect(result.code.match(/\.foregroundStyle\(Color\(uiColor: \.placeholderText\)\)/g)).toHaveLength(3);
    expect(result.code).not.toContain("@State");
  }
}, 30_000);
