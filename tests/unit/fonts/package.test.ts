import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { FontFace } from "../../../src/model/layout.ts";
import type { FontConverter, FontToolResult } from "../../../src/fonts/converter.ts";
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
      pkg.notes.filter((n) => n.startsWith("approximated:") && n.includes("2 unicode-range subsets")),
    ).toHaveLength(1);
  });

  test("a face whose file is not among the sources is not bundled", async () => {
    const pkg = await packageFonts([face({ src: [{ url: "/c.ttf", file: "_fonts/c.ttf" }] })], sources, fake);
    expect(pkg.faces).toEqual([]);
    expect(pkg.assets).toEqual({});
    expect(pkg.notes.filter((n) => n.includes("has no readable src"))).toHaveLength(1);
  });

  test("a converter failure ships nothing and says why", async () => {
    const pkg = await packageFonts([face()], sources, async () => "no fontTools");
    expect(pkg.faces).toEqual([]);
    expect(pkg.assets).toEqual({});
    expect(pkg.notes).toHaveLength(1);
    expect(pkg.notes[0]).toContain("not bundled (no fontTools)");
  });

  test("without rewritten bytes the source bytes are the asset", async () => {
    const pkg = await packageFonts([face()], sources, verbatim);
    expect(pkg.assets).toEqual({ "Fonts/TestFace.ttf": sources.get("_fonts/a.ttf")! });
  });
});

test("a missing python3 leaves the face unbundled with a note and ships no asset", async () => {
  // Bun.spawn resolves executables from the spawn environment, so PATH is cut in a child Bun.
  const script = `import { packageFonts } from ${JSON.stringify(resolve(import.meta.dir, "../../../src/fonts/package.ts"))};
const pkg = await packageFonts([{ family: "Probe", style: "normal", weight: [400, 400], loaded: true,
  src: [{ url: "data:font/ttf;base64,AAEAAAAA" }] }], new Map());
console.log(JSON.stringify({ notes: pkg.notes, faces: pkg.faces.length, assets: Object.keys(pkg.assets) }));`;
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
  const result = JSON.parse(out) as { notes: string[]; faces: number; assets: string[] };
  expect(result.faces).toBe(0);
  expect(result.assets).toEqual([]);
  expect(result.notes.filter((n) => n.includes("not bundled") && n.includes("python3 not found"))).toHaveLength(1);
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
