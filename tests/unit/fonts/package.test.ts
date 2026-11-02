import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import wawoff2 from "wawoff2";
import { assembleSfnt, buildRewrittenNameTable, parseSfnt, readNameTable } from "../../../src/fonts/sfnt.ts";
import type { FontFace } from "../../../src/model/layout.ts";
import type { FontConverter, FontToolResult } from "../../../src/fonts/converter.ts";
import { bundledFamilies } from "../../../src/fonts/metadata.ts";
import { fontOf } from "../../../src/analysis/typography.ts";
import { packageFonts } from "../../../src/fonts/package.ts";
import { fontFileStem } from "../../../src/fonts/source.ts";
import { plistFragment, registrationSwift } from "../../../src/fonts/registration.ts";
import { GENERATED_BY } from "../../../src/model/version.ts";

const METRICS: FontToolResult = {
  upem: 1000,
  ascent: 800,
  descent: 200,
  lineGap: 0,
  useTypoMetrics: false,
  axes: {},
  converted: false,
  renamed: true,
};
const fake: FontConverter = async (_bytes, family, subfamily) => ({
  ...METRICS,
  bytes: new TextEncoder().encode(`${family}|${subfamily}`),
});
/** The input already registers under its family: no rewritten bytes. */
const verbatim: FontConverter = async () => METRICS;
const face = (over: Partial<FontFace> = {}): FontFace => ({
  family: "Test Face",
  weight: [400, 400],
  style: "normal",
  loaded: true,
  src: [{ url: "/a.ttf", file: "_fonts/a.ttf" }],
  ...over,
});
const sources = new Map([
  ["_fonts/a.ttf", new Uint8Array([0, 1, 0, 0])],
  ["_fonts/b.ttf", new Uint8Array([0, 1, 0, 0, 9])],
]);

describe("packageFonts: faces + bytes in, assets out", () => {
  test("a static face ships one asset with the converter's bytes", async () => {
    const pkg = await packageFonts([face()], sources, fake);
    expect(pkg.faces.map((f) => f.file)).toEqual(["TestFace.ttf"]);
    expect(pkg.assets).toEqual({ "Fonts/TestFace.ttf": new TextEncoder().encode("Test Face|Regular") });
    expect(pkg.plist).toContain("<string>Fonts/TestFace.ttf</string>");
    expect(pkg.notes).toEqual([]);
  });

  test("of two unicode-range subsets, the Basic-Latin one is bundled and the drop is reported", async () => {
    const cyrillic = face({ unicodeRange: "U+0400-04FF", src: [{ url: "/b.ttf", file: "_fonts/b.ttf" }] });
    const latin = face({ unicodeRange: "U+0000-00FF" });
    const pkg = await packageFonts([cyrillic, latin], sources, verbatim);
    expect(pkg.assets).toEqual({ "Fonts/TestFace.ttf": sources.get("_fonts/a.ttf")! });
    expect(
      pkg.notes.filter((n) => n.level === "approximated" && n.message.includes("2 unicode-range subsets")),
    ).toHaveLength(1);
  });

  test("a face whose file is not among the sources is not bundled", async () => {
    const pkg = await packageFonts([face({ src: [{ url: "/c.ttf", file: "_fonts/c.ttf" }] })], sources, fake);
    expect(pkg.faces).toEqual([]);
    expect(pkg.assets).toEqual({});
    expect(pkg.notes.filter((n) => n.message.includes("has no readable src"))).toHaveLength(1);
  });

  test("a converter failure ships nothing and says why", async () => {
    const pkg = await packageFonts([face()], sources, async () => "no fontTools");
    expect(pkg.faces).toEqual([]);
    expect(pkg.assets).toEqual({});
    expect(pkg.notes).toHaveLength(1);
    expect(pkg.notes[0]!.message).toContain("not bundled (no fontTools)");
  });

  test("without rewritten bytes the source bytes are the asset", async () => {
    const pkg = await packageFonts([face()], sources, verbatim);
    expect(pkg.assets).toEqual({ "Fonts/TestFace.ttf": sources.get("_fonts/a.ttf")! });
  });
});

test("font packaging runs without python on PATH", async () => {
  const geistPath = resolve(import.meta.dir, "../../conformance/fixtures/assets/geist-latin-wght-normal.woff2");
  const script = `import { readFile } from "node:fs/promises";
import { packageFonts } from ${JSON.stringify(resolve(import.meta.dir, "../../../src/fonts/package.ts"))};
const bytes = await readFile(${JSON.stringify(geistPath)});
const pkg = await packageFonts([{ family: "Geist Variable", style: "normal", weight: [100, 900], loaded: true,
  src: [{ url: "/font.woff2", file: "_fonts/font.woff2" }] }], new Map([["_fonts/font.woff2", bytes]]));
console.log(JSON.stringify({ faces: pkg.faces.length, assets: Object.keys(pkg.assets), notes: pkg.notes }));`;
  const child = Bun.spawn([process.execPath, "-e", script], {
    env: { PATH: "/nonexistent" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(err).toBe("");
  expect(code).toBe(0);
  const result = JSON.parse(out) as { notes: { message: string }[]; faces: number; assets: string[] };
  expect(result.faces).toBe(1);
  expect(result.assets).toEqual(["Fonts/GeistVariable.ttf"]);
  expect(result.notes).toEqual([]);
});

test("corrupt font bytes leave the face unbundled with a note", async () => {
  const pkg = await packageFonts(
    [
      {
        family: "Probe",
        style: "normal",
        weight: [400, 400],
        loaded: true,
        src: [{ url: "data:font/ttf;base64,AAEAAAAA" }],
      },
    ],
    new Map(),
  );
  expect(pkg.faces).toHaveLength(0);
  expect(pkg.assets).toEqual({});
  expect(pkg.notes.some((n) => n.message.includes("not bundled"))).toBe(true);
});

test("woff2 decompression and recompression round trip preserves all tables", async () => {
  const geistPath = resolve(import.meta.dir, "../../conformance/fixtures/assets/geist-latin-wght-normal.woff2");
  const origWoff2 = await readFile(geistPath);
  const ttf1 = await wawoff2.decompress(origWoff2);
  expect(ttf1.length).toBeGreaterThan(origWoff2.length);
  const sfnt1 = parseSfnt(ttf1);
  expect(sfnt1.tables.has("head")).toBe(true);
  expect(sfnt1.tables.has("name")).toBe(true);
  expect(sfnt1.tables.has("fvar")).toBe(true);

  const woff2 = await wawoff2.compress(ttf1);
  const ttf2 = await wawoff2.decompress(woff2);
  const sfnt2 = parseSfnt(ttf2);
  expect([...sfnt1.tables.keys()].sort()).toEqual([...sfnt2.tables.keys()].sort());
});

test("a non-ASCII family keeps Windows name records only (Mac Roman cannot spell it)", async () => {
  const geistPath = resolve(import.meta.dir, "../../conformance/fixtures/assets/geist-latin-wght-normal.woff2");
  const sfnt = parseSfnt(await wawoff2.decompress(await readFile(geistPath)));
  const { records } = readNameTable(sfnt.tables.get("name")!.data);
  const table = buildRewrittenNameTable(records, "Söhne", "Regular", true);
  const rewritten = readNameTable(table);
  expect(rewritten.names.get(1)).toBe("Söhne");
  expect(rewritten.records.filter((r) => r.platformID === 1 && r.nameID === 1)).toEqual([]);
});

test("name table parsing and rewriting updates CSS family name correctly", async () => {
  const geistPath = resolve(import.meta.dir, "../../conformance/fixtures/assets/geist-latin-wght-normal.woff2");
  const ttf = await wawoff2.decompress(await readFile(geistPath));
  const sfnt = parseSfnt(ttf);
  const nameTable = sfnt.tables.get("name")!;
  const { records, names } = readNameTable(nameTable.data);
  expect(names.get(1)).toBe("Geist");

  // Rewrite name table to custom family name
  const rewritten = buildRewrittenNameTable(records, "CustomFamily", "Regular", true);
  sfnt.tables.set("name", { offset: 0, length: rewritten.length, checksum: 0, data: rewritten });
  const assembled = assembleSfnt(sfnt.sfntVersion, sfnt.tables);

  const sfnt2 = parseSfnt(assembled);
  const { names: names2 } = readNameTable(sfnt2.tables.get("name")!.data);
  expect(names2.get(1)).toBe("CustomFamily");
  expect(names2.get(2)).toBe("Regular");
  expect(names2.get(4)).toBe("CustomFamily");
  expect(names2.get(6)).toBe("CustomFamily");
  expect(names2.get(16)).toBe("CustomFamily");
});

test("packaged font file stems never collide", () => {
  const claimed = new Map([["font", "思源黑体"]]);
  expect(fontFileStem("思源黑体", "Regular", new Map())).toBe("Font");
  expect(fontFileStem("源ノ角ゴシック", "Regular", claimed)).toBe("Font-2");
  expect(fontFileStem("Inter", "Italic", new Map())).toBe("Inter-Italic");
  expect(fontFileStem("Inter", "Italic", new Map([["inter-italic", "Inter"]]))).toBeUndefined();
  expect(fontFileStem("Ab", "Regular", new Map())).toBe("Ab");
  expect(fontFileStem("AB", "Regular", new Map([["ab", "Ab"]]))).toBe("AB-2");
});

test("the plist fragment and +Fonts.swift name the Markswift version", () => {
  expect(plistFragment(["Geist.ttf"])).toContain(GENERATED_BY);
  expect(registrationSwift([], "CardView")).toContain(GENERATED_BY);
});

test("width descriptors retain distinct files and select narrower/wider faces in CSS order", async () => {
  const pkg = await packageFonts([face(), face({ stretch: [75, 75] }), face({ stretch: [125, 125] })], sources, fake);
  expect(pkg.faces).toHaveLength(3);
  expect(new Set(pkg.faces.map((f) => f.file)).size).toBe(3);
  expect(pkg.notes).toEqual([]);
  const families = bundledFamilies(pkg);
  const chosen = (stretch: string, variation = "normal") =>
    fontOf(
      {
        "font-family": "Test Face",
        "font-size": "16px",
        "font-stretch": stretch,
        "font-variation-settings": variation,
      },
      families,
    ).family;
  expect(chosen("90%")).toMatchObject({ name: "Test Face Width 75-75" });
  expect(chosen("100%")).toMatchObject({ name: "Test Face" });
  expect(chosen("110%")).toMatchObject({ name: "Test Face Width 125-125" });
  expect(chosen("75%", '"wdth" 125')).toMatchObject({ name: "Test Face Width 75-75" });
});
