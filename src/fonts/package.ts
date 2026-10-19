import type { FontFace } from "../model/layout.ts";
import type { DiagnosticLevel } from "../model/semantic.ts";
import type { FaceMetrics } from "../model/fonts.ts";
import type { FontPackage, PackagedFace } from "./types.ts";
import { coversLatin, srcBytes, fontFileStem, WEIGHT_SUBFAMILY } from "./source.ts";
import { type FontConverter, pythonFontConverter } from "./converter.ts";
import { plistFragment } from "./registration.ts";

/**
 * Packages every bundleable face: faces + their captured bytes in, `Fonts/<file>` assets out.
 *
 * `sources` holds the capture's font bytes keyed by `src[].file`; `data:` sources carry their
 * own. Faces are grouped by (family, style): within a group the Basic-Latin subset wins, the
 * rest are reported. A face whose bytes cannot be read, or whose format iOS cannot load and
 * `convert` cannot convert, is noted and left out of the package; no asset is shipped for it.
 */
export async function packageFonts(
  faces: FontFace[],
  sources: ReadonlyMap<string, Uint8Array>,
  convert: FontConverter = pythonFontConverter,
  signal?: AbortSignal,
): Promise<FontPackage> {
  const notes: FontPackage["notes"] = [];
  const note = (level: DiagnosticLevel, message: string) =>
    notes.push({ source: "fonts", level, feature: "font-family", message });
  const packaged: PackagedFace[] = [];
  const assets: Record<string, Uint8Array> = {};
  if (!faces.length) return { faces: [], assets, plist: "", notes };

  // (family, style, weight range) is one bundled face; several `unicode-range` subsets of the
  // same key are the same font cut up, and iOS can only hold one of them.
  const groups: Record<string, FontFace[]> = {};
  for (const f of faces) {
    const k = `${f.family}|${f.style}|${f.weight.join("-")}|${(f.stretch ?? [100, 100]).join("-")}`;
    (groups[k] ??= []).push(f);
  }
  const claimed = new Map<string, string>();
  for (const k of Object.keys(groups).sort()) {
    const group = groups[k]!;
    const latin = group.filter((f) => coversLatin(f.unicodeRange));
    const chosen = (latin.length ? latin : group).find((f) => f.loaded) ?? (latin.length ? latin[0]! : group[0]!);
    if (group.length > 1) {
      note(
        "approximated",
        `font-family ${chosen.family} ships ${group.length} unicode-range subsets at weight ${chosen.weight.join("–")}; bundled the one covering Basic Latin, ${group.length - 1} dropped (iOS has no per-codepoint fallback inside a family)`,
      );
    }
    if (!latin.length)
      note("unmapped", `font-family ${chosen.family} declares no face covering Basic Latin; bundled its first subset`);

    let bytes: Uint8Array | undefined;
    let usedSrc: FontFace["src"][number] | undefined;
    for (const src of chosen.src) {
      bytes = srcBytes(src, sources);
      if (bytes?.length) {
        usedSrc = src;
        break;
      }
    }
    if (!bytes?.length || !usedSrc) {
      note(
        "unmapped",
        `font-family ${chosen.family} has no readable src (${chosen.src.map((s) => s.url.slice(0, 60)).join(", ") || "none"}) → not bundled, text falls back to the system font`,
      );
      continue;
    }

    const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
    // A family shipped as several static weights registers several files under one family name;
    // each needs its own subfamily or the lookup cannot tell them apart. A variable face covers
    // the whole range, so it is the family's Regular.
    const staticWeight = chosen.weight[0] === chosen.weight[1] ? chosen.weight[0] : undefined;
    const weightName =
      staticWeight !== undefined && staticWeight !== 400 ? (WEIGHT_SUBFAMILY[staticWeight] ?? `W${staticWeight}`) : "";
    const subfamily = [weightName, chosen.style === "normal" ? "" : "Italic"].filter(Boolean).join(" ") || "Regular";
    const stretch = chosen.stretch ?? [100, 100];
    const family =
      stretch[0] === 100 && stretch[1] === 100 ? chosen.family : `${chosen.family} Width ${stretch.join("-")}`;
    const stem = fontFileStem(family, subfamily, claimed);
    if (stem === undefined) {
      note(
        "approximated",
        `font-family ${chosen.family} declares another ${subfamily} face (${chosen.style}, weight ${chosen.weight.join("–")}); iOS registers one face per name, bundled the first`,
      );
      continue;
    }
    const file = `${stem}.${sig === "OTTO" ? "otf" : "ttf"}`;
    const tool = await convert(bytes, family, subfamily, signal);
    if (typeof tool === "string") {
      // No converter: nothing is shipped. WOFF/WOFF2 is the usual cause, so the note names the format.
      const fmt = sig === "wOF2" ? "WOFF2" : sig === "wOFF" ? "WOFF" : "the source format";
      note(
        "unmapped",
        `font-family ${chosen.family} not bundled (${tool}); text falls back to the system font` +
          (sig === "wOF2" || sig === "wOFF"
            ? ` — iOS cannot register ${fmt}; converting it needs python3 with fontTools + brotli`
            : ""),
      );
      continue;
    }
    assets[`Fonts/${file}`] = tool.bytes ?? bytes; // No rewritten bytes: already an sfnt with a matching name, shipped verbatim.
    const metrics: FaceMetrics = {
      upem: tool.upem,
      ascent: tool.ascent,
      descent: tool.descent,
      lineGap: tool.lineGap,
      useTypoMetrics: tool.useTypoMetrics,
    };
    packaged.push({
      family,
      sourceFamily: chosen.family,
      stretch,
      file,
      style: chosen.style,
      weight: chosen.weight,
      axes: tool.axes,
      metrics,
      converted: tool.converted,
      renamed: tool.renamed,
    });
    claimed.set(stem.toLowerCase(), family);
    if (!chosen.loaded)
      note(
        "approximated",
        `font-family ${chosen.family} never loaded in the reference browser, so the reference pixels are a fallback face; bundled it anyway`,
      );
  }

  // A family whose bundled face is variable covers every weight of its axis; one whose face is
  // static covers one. Both are emitted as `.custom(family).weight(…)`, so a weight the family
  // has no instance for is a synthetic (smeared) weight and has to be reported once.
  for (const f of packaged) {
    if (!f.axes["wght"] && f.weight[0] !== f.weight[1]) {
      note(
        "approximated",
        `font-family ${f.family} declares weight ${f.weight.join("–")} but the bundled file has no wght axis; weights other than ${f.weight[0]} are synthesised`,
      );
    }
  }
  const files = packaged.map((f) => f.file).sort();
  return { faces: packaged, assets, plist: plistFragment(files), notes };
}
