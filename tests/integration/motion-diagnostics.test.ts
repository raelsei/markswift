import { expect, test } from "bun:test";
import { convert, convertHtml } from "../../src/index.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("active CSS motion is attributed to emitted boxes and merged inline text", async () => {
  const result = await convertHtml(`<!doctype html><style>
    @keyframes pulse { from { opacity: .4 } to { opacity: 1 } }
    .animated { animation: pulse .2s linear; }
    .transition { transition: transform .3s ease; }
    .inline-motion { animation: pulse .2s linear; }
    .pseudo::before { content: "★"; animation: pulse .2s linear; }
    .zero { animation: pulse 0s; transition: opacity 0s; }
    .none { animation-name: none; animation-duration: .2s; transition-property: none; transition-duration: .3s; }
  </style><main data-markswift-root style="font:16px Arial,sans-serif">
    <div id="animated" class="animated">Box</div>
    <div id="transition" class="transition">Transition</div>
    <p id="inline">Plain <span class="inline-motion">moving</span> text</p>
    <p id="pseudo" class="pseudo">Text</p>
    <div id="zero" class="zero">Still</div>
    <div id="none" class="none">Still</div>
  </main>`, { name: "MotionDiagnostics" });

  const notes = (id: string) => result.diagnostics.find(item => item.id === `#${id}`)?.notes ?? [];
  const motionNotes = (id: string) => notes(id).filter(note => /CSS (?:animation|transition) captured/.test(note));
  expect(motionNotes("animated")).toEqual([expect.stringContaining("CSS animation captured as a static state")]);
  expect(motionNotes("transition")).toEqual([expect.stringContaining("CSS transition captured as a static state")]);
  expect(motionNotes("inline")).toEqual([expect.stringContaining("CSS animation captured as a static state")]);
  expect(motionNotes("pseudo")).toEqual([expect.stringContaining("CSS animation captured as a static state")]);
  expect(motionNotes("zero")).toEqual([]);
  expect(motionNotes("none")).toEqual([]);
  expect(result.layout.root.children.find(node => node.attrs.id === "transition")?.styles["transition-property"]).toBe("transform");
  for (const id of ["animated", "transition", "inline", "pseudo"]) {
    expect(result.diagnostics.find(item => item.id === `#${id}`)?.confidence).toBe("approximated");
  }
}, 30_000);

browserTest("dormant keyframes are reported as declarations without blaming the static card", async () => {
  const result = await convertHtml(`<!doctype html><style>
    .card.flash { animation: cardFlash .65s ease; }
    @keyframes cardFlash { from { transform: scale(1.1) } to { transform: scale(1) } }
  </style><div data-markswift-root class="card">Card</div>`, { name: "DormantCard" });
  expect(result.warnings.join(" ")).toContain("@keyframes cardFlash");
  expect(result.warnings.join(" ")).toContain("declaration");
  expect(result.diagnostics.flatMap(item => item.notes).some(note => /CSS animation captured/.test(note))).toBe(false);
}, 30_000);

browserTest("keyframes in a linked same-origin stylesheet are reported", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-motion-"));
  try {
    const file = join(directory, "index.html");
    await writeFile(file, '<!doctype html><link rel="stylesheet" href="style.css"><div data-markswift-root>Card</div>');
    await writeFile(join(directory, "style.css"), '@keyframes linkedPulse { from { opacity: 0 } to { opacity: 1 } }');
    const result = await convert({ file }, { name: "LinkedKeyframes" });
    expect(result.warnings.join(" ")).toContain("@keyframes linkedPulse");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
