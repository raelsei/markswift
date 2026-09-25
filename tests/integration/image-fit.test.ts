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

browserTest("SVG data images centre cover and contain artwork in the measured image box", async () => {
  const svg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160"><rect width="100" height="160" fill="purple"/><circle cx="50" cy="60" r="30" fill="yellow"/></svg>');
  const result = await convertHtml(`<main data-markswift-root style="display:flex;gap:8px">${["cover", "contain", "fill"].map(fit =>
    `<img id="${fit}" src="${svg}" alt="${fit}" style="width:110px;height:110px;object-fit:${fit}">`
  ).join("")}</main>`, { name: "VectorFit" });

  // cover is 110×176, contain is 68.75×110. The vector's intrinsic frame cannot
  // become the measured <img> box; the overlay positions it at the box centre.
  expect(result.code).toContain(".frame(width: 110.0, height: 176.0)");
  expect(result.code).toContain(".frame(width: 68.75, height: 110.0)");
  expect(result.code.match(/\.overlay\(alignment: \.center\) \{/g)).toHaveLength(2);
  expect(result.code).toMatch(/Color\.clear\s*\.overlay\(alignment: \.center\) \{[\s\S]*?height: 176\.0\)[\s\S]*?\.accessibilityLabel\("cover"\)/);
  expect(result.code).toMatch(/Color\.clear\s*\.overlay\(alignment: \.center\) \{[\s\S]*?height: 110\.0\)[\s\S]*?\.accessibilityLabel\("contain"\)/);
  expect(result.diagnostics.filter(item => ["#cover", "#contain", "#fill"].includes(item.id))).toHaveLength(0);
}, 30_000);
