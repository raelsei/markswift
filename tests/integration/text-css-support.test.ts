import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("text indentation and word-break policies are reported on their affected text", async () => {
  const word = "characteristicreconfiguration";
  const result = await convertHtml(`
    <main data-markswift-root style="width:420px;font:16px/24px Arial,sans-serif">
      <p id="indented" style="text-indent:24px">First line starts farther in than the others.</p>
      <p id="break-all" style="width:380px;word-break:break-all">${word}</p>
      <p id="keep-all" style="width:380px;word-break:keep-all">${word}</p>
      <p id="anywhere" style="width:380px;overflow-wrap:anywhere">${word}</p>
      <p id="break-word" style="width:380px;overflow-wrap:break-word">${word}</p>
      <p id="split" style="word-break:break-all"><span>joined</span><span>words</span></p>
      <p id="ordinary" style="width:380px">${word}</p>
    </main>
  `, { name: "TextBreakPolicies", mode: "app" });

  const element = (id: string) => result.layout.root.children.find(node => node.attrs.id === id);
  const notes = (id: string) => result.diagnostics.find(item => item.id === `#${id}`)?.notes ?? [];
  expect(element("indented")?.styles["text-indent"]).toBe("24px");
  for (const id of ["break-all", "keep-all", "anywhere", "break-word"]) {
    // It fits at capture width. At a narrower SwiftUI width, these CSS rules would change its
    // wrapping, but the generated app-mode Text has no equivalent line-breaking policy.
    expect(element(id)?.bounds.h).toBe(24);
    expect(element(id)?.children.find(node => node.tag === "#text")?.bounds.w).toBeLessThan(380);
  }
  expect(notes("indented").filter(note => note.includes("text-indent"))).toEqual([
    expect.stringContaining("first-line indentation"),
  ]);
  for (const [id, property, value] of [
    ["break-all", "word-break", "break-all"],
    ["keep-all", "word-break", "keep-all"],
    ["anywhere", "overflow-wrap", "anywhere"],
    ["break-word", "overflow-wrap", "break-word"],
  ] as const) {
    expect(notes(id).filter(note => note.includes(`${property}: ${value}`))).toHaveLength(1);
  }
  expect(notes("split").filter(note => note.includes("word-break: break-all"))).toHaveLength(1);
  expect(notes("ordinary").some(note => /word-break|overflow-wrap|text-indent/.test(note))).toBe(false);
  expect(result.code).toContain(word);
}, 30_000);
