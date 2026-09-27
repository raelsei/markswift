import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FontFace } from "../model/layout.ts";
import type { FaceMetrics } from "../model/fonts.ts";
import type { FontPackage, PackagedFace } from "./types.ts";
import { coversLatin, srcBytes, sanitize, WEIGHT_SUBFAMILY } from "./source.ts";
import { runFontTool } from "./converter.ts";
import { plistFragment, registrationSwift } from "./registration.ts";


/**
 * Packages every bundleable face into `<swiftDir>/Fonts/` and returns what was written.
 *
 * `outDir` resolves `src[].file` (the capture's `_fonts/`). Faces are grouped by (family,
 * style): within a group the Basic-Latin subset wins, the rest are reported. A face whose bytes
 * cannot be read, or whose format iOS cannot load and `fontTools` cannot convert, is noted and
 * skipped — except that a failed *conversion* still writes the original bytes, so the
 * missing-converter case is visible in the bundle instead of looking like a design with no font.
 */
export async function packageFonts(faces: FontFace[], swiftDir: string, outDir: string): Promise<FontPackage> {
  const fontsDir = join(swiftDir, "Fonts");
  await rm(fontsDir, { recursive: true, force: true });
  const notes: string[] = [];
  const packaged: PackagedFace[] = [];
  const filenames = new Map<string, string>();
  const publicNames = new Map<string, string>();
  if (!faces.length) return { faces: [], plist: "", swift: "", notes };

  // (family, style, weight range) is one bundled face; several `unicode-range` subsets of the
  // same key are the same font cut up, and iOS can only hold one of them.
  const groups: Record<string, FontFace[]> = {};
  for (const f of faces) {
    const k = `${f.family}|${f.style}|${f.weight.join("-")}`;
    (groups[k] ??= []).push(f);
  }
  await mkdir(fontsDir, { recursive: true });
  for (const k of Object.keys(groups).sort()) {
    const group = groups[k]!;
    const sourceVariations = [...new Set(group.map(face => face.variationSettings ?? null))];
    const latin = group.filter((f) => coversLatin(f.unicodeRange));
    const chosen = (latin.length ? latin : group).find((f) => f.loaded) ?? (latin.length ? latin[0]! : group[0]!);
    if (group.length > 1) {
      notes.push(
        `approximated: font-family ${chosen.family} ships ${group.length} ${sourceVariations.length > 1 ? "source declarations/subsets with differing variation descriptors" : "unicode-range subsets"} at weight ${chosen.weight.join("–")}; bundled the one covering Basic Latin, ${group.length - 1} dropped (iOS has no per-codepoint fallback inside a family)`,
      );
    }
    if (!latin.length) notes.push(`unmapped: font-family ${chosen.family} declares no face covering Basic Latin; bundled its first subset`);

    let bytes: Uint8Array | undefined;
    let usedSrc: FontFace["src"][number] | undefined;
    for (const src of chosen.src) {
      bytes = await srcBytes(src, outDir);
      if (bytes?.length) {
        usedSrc = src;
        break;
      }
    }
    if (!bytes?.length || !usedSrc) {
      notes.push(`unmapped: font-family ${chosen.family} has no readable src (${chosen.src.map((s) => s.url.slice(0, 60)).join(", ") || "none"}) → not bundled, text falls back to the system font`);
      continue;
    }

    const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
    // A family shipped as several static weights registers several files under one family name;
    // each needs its own subfamily or the lookup cannot tell them apart. A variable face covers
    // the whole range, so it is the family's Regular.
    const staticWeight = chosen.weight[0] === chosen.weight[1] ? chosen.weight[0] : undefined;
    const weightName = staticWeight !== undefined && staticWeight !== 400 ? (WEIGHT_SUBFAMILY[staticWeight] ?? `W${staticWeight}`) : "";
    const subfamily = [weightName, chosen.style === "normal" ? "" : "Italic"].filter(Boolean).join(" ") || "Regular";
    const stem = sanitize(chosen.family) + (subfamily === "Regular" ? "" : `-${subfamily.replace(/\s+/g, "")}`);
    const file = `${stem}.${sig === "OTTO" ? "otf" : "ttf"}`;
    // Case-fold because common macOS filesystems cannot distinguish differently cased names.
    const filenameKey = file.toLowerCase(), existingFamily = filenames.get(filenameKey);
    if (existingFamily !== undefined) {
      notes.push(`unmapped: font-family ${chosen.family} has a packaged filename collision (${file}) with ${existingFamily}; skipped this face instead of overwriting its source asset`);
      continue;
    }
    filenames.set(filenameKey, chosen.family);
    const dst = join(fontsDir, file);
    const tmp = join(fontsDir, `.${stem}.src`);
    await writeFile(tmp, bytes);
    const tool = await runFontTool(tmp, dst, chosen.family, subfamily, true);
    if (typeof tool === "string") {
      // No converter: ship what we have and say exactly what is wrong with it. WOFF2 will not
      // register, so the note has to name the format, not just the failure.
      await writeFile(dst, bytes);
      await rm(tmp, { force: true });
      const fmt = sig === "wOF2" ? "WOFF2" : sig === "wOFF" ? "WOFF" : "the source format";
      notes.push(
        `unmapped: font-family ${chosen.family} could not be packaged (${tool}); wrote ${fmt} unconverted` +
          (sig === "wOF2" || sig === "wOFF" ? ` — iOS cannot register ${fmt}, so this face will not load (needs python3 with fontTools + brotli)` : ""),
      );
      continue;
    }
    if (!tool.wrote) await writeFile(dst, bytes); // Already an sfnt with a matching name: copy verbatim.
    await rm(tmp, { force: true });
    const metrics: FaceMetrics = { upem: tool.upem, ascent: tool.ascent, descent: tool.descent, lineGap: tool.lineGap, useTypoMetrics: tool.useTypoMetrics };
    const assetHash = createHash("sha256").update(await readFile(dst)).digest("hex");
    const publicAsset = tool.postScriptName ? publicNames.get(tool.postScriptName) : undefined;
    if (publicAsset !== undefined && publicAsset !== assetHash) {
      await rm(dst, { force: true });
      notes.push(`unmapped: font-family ${chosen.family} has a public-name collision (${tool.postScriptName}) with a different packaged asset; skipped this face instead of registering an ambiguous source`);
      continue;
    }
    if (tool.postScriptName) publicNames.set(tool.postScriptName, assetHash);
    // Grouping/subset choice cannot prove that a discarded source descriptor was normal.
    if (tool.axes.opsz && sourceVariations.length > 1) notes.push(`approximated: font-family ${chosen.family} has conflicting or unknown source variation descriptors; retained the ambiguity for optical sizing`);
    packaged.push({ family: chosen.family, file, style: chosen.style, weight: chosen.weight, axes: tool.axes, metrics, converted: tool.converted, renamed: tool.renamed,
      ...(tool.axisDefaults && Object.keys(tool.axisDefaults).length ? { axisDefaults: tool.axisDefaults } : {}),
      ...(tool.axes.opsz ? { sourceVariations } : {}),
      ...(tool.postScriptName ? { postScriptName: tool.postScriptName } : {}), assetHash });
    if (!chosen.loaded) notes.push(`approximated: font-family ${chosen.family} never loaded in the reference browser, so the reference pixels are a fallback face; bundled it anyway`);
  }

  // A family whose bundled face is variable covers every weight of its axis; one whose face is
  // static covers one. Both are emitted as `.custom(family).weight(…)`, so a weight the family
  // has no instance for is a synthetic (smeared) weight and has to be reported once.
  for (const f of packaged) {
    if (!f.axes["wght"] && f.weight[0] !== f.weight[1]) {
      notes.push(`approximated: font-family ${f.family} declares weight ${f.weight.join("–")} but the bundled file has no wght axis; weights other than ${f.weight[0]} are synthesised`);
    }
  }
  const files = packaged.map((f) => f.file).sort();
  return { faces: packaged, plist: plistFragment(files), swift: files.length ? registrationSwift(packaged) : "", notes };
}
