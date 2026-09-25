import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FontFace } from "../model/layout.ts";


/** Codepoints a face must cover to be the one worth bundling: Basic Latin. */
export function coversLatin(range: string | undefined): boolean {
  if (!range) return true;
  for (const part of range.split(",")) {
    const m = /u\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m) continue;
    const lo = Number.parseInt(m[1]!.replace(/\?/g, "0"), 16);
    const hi = m[2] ? Number.parseInt(m[2], 16) : Number.parseInt(m[1]!.replace(/\?/g, "f"), 16);
    if (lo <= 0x41 && 0x41 <= hi) return true; // 'A'
  }
  return false;
}


/** Bytes behind one `src` entry: the `data:` URL itself, or the file the capture saved. */
export async function srcBytes(src: FontFace["src"][number], outDir: string): Promise<Uint8Array | undefined> {
  const data = /^data:[^,]*;base64,(.*)$/s.exec(src.url);
  if (data) return Uint8Array.from(Buffer.from(data[1]!, "base64"));
  if (src.url.startsWith("data:")) return new TextEncoder().encode(decodeURIComponent(src.url.slice(src.url.indexOf(",") + 1)));
  if (!src.file) return undefined;
  try {
    return new Uint8Array(await readFile(resolve(outDir, src.file)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}


/** OpenType weight class → the subfamily name a font file conventionally carries for it. */
export const WEIGHT_SUBFAMILY: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};


/** `Geist Variable` → `GeistVariable`; a file name and a PostScript name stem. */
export function sanitize(family: string): string {
  return family.replace(/[^A-Za-z0-9]/g, "") || "Font";
}


/** Font files of a generated Swift dir, for the harness to bundle. */
export async function packagedFontFiles(swiftDir: string): Promise<string[]> {
  const dir = join(swiftDir, "Fonts");
  try {
    return (await readdir(dir)).filter((f) => /\.(ttf|otf)$/.test(f)).sort().map((f) => join(dir, f));
  } catch {
    return [];
  }
}
