import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("input button captions survive conversion and form actions report their missing behavior", async () => {
  const result = await convertHtml(`<form data-h2s-root style="font:16px Arial,sans-serif">
    <input id="submit" type="submit" value="Go now">
    <input id="reset" type="reset" value="Clear now">
    <input id="button" type="button" value="Before">
    <input id="default-submit" type="submit">
    <input id="default-reset" type="reset">
    <input id="empty-button" type="button" value="">
    <input id="upper-submit" type="submit" value="go now" style="text-transform:uppercase">
    <input id="capital-button" type="button" value="go now" style="text-transform:capitalize">
  </form>`, { name: "SubmitControls", async prepare(page) {
    await page.evaluate(() => { (document.querySelector("#button") as HTMLInputElement).value = "Try now"; });
  } });

  for (const caption of ["Go now", "Clear now", "Try now", "Submit", "Reset"]) {
    expect(result.code).toContain(`Text(verbatim: "${caption}")`);
  }
  expect(result.code).toContain("Button(action: {})");
  expect(result.code).toContain('Text(verbatim: "")');
  expect(result.code).not.toContain("EmptyView()");
  expect(result.code).not.toContain("Before");
  expect(result.code).toMatch(/Text\(verbatim: "go now"\)\s*\.textCase\(\.uppercase\)/);
  expect(result.diagnostics.find(item => item.id === "#capital-button")?.notes.join(" ")).toContain("text-transform: capitalize");
  expect(result.layout.root.children.find(node => node.attrs.id === "default-submit")?.attrs.value).toBeUndefined();
  expect(result.layout.root.children.find(node => node.attrs.id === "empty-button")?.attrs.value).toBe("");

  for (const id of ["submit", "reset", "default-submit", "default-reset"]) {
    const diagnostic = result.diagnostics.find(item => item.id === `#${id}`);
    expect(diagnostic?.confidence).toBe("approximated");
    expect(diagnostic?.notes.join(" ")).toMatch(id.includes("reset") ? /form reset/i : /form submission/i);
  }
}, 30_000);
