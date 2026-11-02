/**
 * Repeated-sibling extraction must not change a pixel: for every app capture of a pilot run, compile
 * with extraction on and off, render both on macOS and compare raw pixels.
 *
 * Usage: bun run tools/verify/extraction-identity.ts <pilot-run-dir>
 * Prints `{ cases, unchanged, extracted, differing }`; exits 1 when any case differs or none extracted.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { compileLayout } from "../../src/compiler/index.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { registrationSwift } from "../../src/fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import type { ConversionResult } from "../../src/index.ts";
import type { LayoutDoc } from "../../src/model/layout.ts";
import { renderMac } from "./native.ts";

const run = process.argv[2];
if (!run) throw new Error("usage: bun run tools/verify/extraction-identity.ts <pilot-run-dir>");
const keys = (await readdir(run, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.endsWith("-app"))
  .map((d) => d.name)
  .sort();
const work = await mkdtemp(join(tmpdir(), "markswift-extraction-identity-"));
const report = { cases: 0, unchanged: 0, extracted: 0, differing: [] as string[] };

async function check(key: string): Promise<void> {
  const dir = join(run!, key);
  const file = Bun.file(join(dir, "layout.json"));
  if (!(await file.exists())) return;
  report.cases++;
  const layout = (await file.json()) as LayoutDoc;
  // Fonts exactly as the pilot packaged them (`pilot-run.ts`).
  const fontDir = join(dir, "_fonts");
  const fontFiles = await readdir(fontDir).catch(() => [] as string[]);
  const sources = new Map<string, Uint8Array>();
  for (const f of fontFiles) sources.set(`_fonts/${f}`, await Bun.file(join(fontDir, f)).bytes());
  const fonts = await packageFonts(layout.fonts, sources);
  const name =
    "Pilot" +
    key
      .split("-")
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join("");
  const options = {
    name,
    mode: "app" as const,
    bundledFamilies: bundledFamilies(fonts),
    fontMetrics: metricsForFonts(fonts),
  };
  const on = compileLayout(layout, options);
  const off = compileLayout(layout, { ...options, extract: false });
  if (on.code === off.code) {
    report.unchanged++;
    return;
  }
  report.extracted++;
  const pixels = async (arm: typeof on, tag: string) => {
    const files = { ...arm.files };
    if (fonts.faces.length) files[`${name}+Fonts.swift`] = registrationSwift(fonts.faces, name);
    const result = { ...arm, files, layout, assets: { ...arm.assets, ...fonts.assets } } as unknown as ConversionResult;
    const png = join(work, `${key}-${tag}.png`);
    await renderMac(result, join(work, `${key}-${tag}`), png);
    return sharp(png).raw().toBuffer();
  };
  if (Buffer.compare(await pixels(on, "on"), await pixels(off, "off")) !== 0) report.differing.push(key);
}

try {
  // ponytail: 4 concurrent swiftc builds; raise when the corpus outgrows the wait.
  const queue = [...keys];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let key = queue.shift(); key; key = queue.shift()) await check(key);
    }),
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
report.differing.sort();
console.log(JSON.stringify(report, null, 2));
if (report.differing.length || report.extracted === 0) process.exit(1);
