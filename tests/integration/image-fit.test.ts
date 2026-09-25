import { expect, test } from "bun:test";
import sharp from "sharp";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";
import type { ImageNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("object-fit and object-position survive capture with honest image mapping", async () => {
  // Unequal red/blue halves and a wide aspect ratio make stretching, clipping and positioning
  // visibly different when the emitted Swift view is rendered.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><path fill="red" d="M0 0h40v40H0z"/><path fill="blue" d="M40 0h40v40H40z"/></svg>');
  const png = await sharp(svg).png().toBuffer();
  const src = `data:image/png;base64,${png.toString("base64")}`;
  const html = `<main data-markswift-root style="width:600px;display:flex;gap:8px"><img id="default" src="${src}" alt="default" style="width:65px;height:65px">${[
    ["fill", "fill", "50% 50%"],
    ["cover", "cover", "50% 50%"],
    ["contain", "contain", "50% 50%"],
    ["none", "none", "50% 50%"],
    ["scale-down", "scale-down", "50% 50%"],
    ["positioned", "cover", "left top"],
  ].map(([id, fit, position]) => `<img id="${id}" src="${src}" alt="${id}" style="width:65px;height:65px;object-fit:${fit};object-position:${position}">`).join("")}</main>`;
  const result = await convertHtml(html, { name: "ImageFit", mode: "app" });
  const captured = new Map(result.layout.root.children.filter(n => n.tag === "img").map(n => [n.attrs.id, n]));
  const images = new Map<string, ImageNode>();
  visit(inferScreen(result.layout, "ImageFit").root, n => { if (n.kind === "image") images.set(n.id, n); });
  const diagnostic = (id: string) => result.diagnostics.find(n => n.id === `#${id}`);

  for (const id of ["default", "fill", "cover", "contain", "none", "scale-down", "positioned"]) {
    expect(captured.get(id)?.styles["object-position"]).toBeDefined();
    expect(images.get(`#${id}`)).toBeDefined();
  }
  expect(captured.get("default")?.styles["object-fit"]).toBe("fill");
  expect(images.get("#default")?.contentMode).toBe("stretch");
  expect(images.get("#fill")?.contentMode).toBe("stretch");
  expect(images.get("#cover")?.contentMode).toBe("fill");
  expect(images.get("#contain")?.contentMode).toBe("fit");
  expect(images.get("#none")?.contentMode).toBe("none");
  for (const id of ["default", "fill", "cover", "contain"]) expect(diagnostic(id)).toBeUndefined();
  expect(diagnostic("none")?.notes.join(" ")).toContain("object-fit: none");
  expect(diagnostic("scale-down")?.notes.join(" ")).toContain("object-fit: scale-down");
  expect(diagnostic("positioned")?.notes.join(" ")).toContain("object-position: 0% 0%");
  expect(result.code).toMatch(/Image\.markswiftData\("[^"]+"\)\.resizable\(\)\s*\.accessibilityLabel\("fill"\)/);
  expect(result.code).toMatch(/Image\.markswiftData\("[^"]+"\)\.resizable\(\)\s*\.accessibilityLabel\("default"\)/);
  expect(result.code).toMatch(/Image\.markswiftData\("[^"]+"\)\.resizable\(\)\.aspectRatio\(contentMode: \.fill\)\s*\.accessibilityLabel\("cover"\)/);
  expect(result.code).toMatch(/Image\.markswiftData\("[^"]+"\)\.resizable\(\)\.aspectRatio\(contentMode: \.fit\)\s*\.accessibilityLabel\("contain"\)/);
  expect(result.code).toMatch(/Image\.markswiftData\("[^"]+"\)\s*\.accessibilityLabel\("none"\)/);
  expect(result.mapping.approximated).toBeGreaterThanOrEqual(3);
}, 30_000);
