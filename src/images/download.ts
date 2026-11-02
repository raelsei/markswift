import type { LayoutDoc, LayoutNode } from "../model/layout.ts";
import type { ConversionWarning } from "../model/semantic.ts";
import { parseImageSet } from "../css/index.ts";
import { parseSrcset, select2xCandidate } from "./density.ts";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
export const IMAGE_TIMEOUT_MS = 10_000; // 10s per image

const RASTER_MAGIC: Array<[ext: string, magic: number[]]> = [
  ["png", [0x89, 0x50, 0x4e, 0x47]],
  ["jpg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38]],
  ["bmp", [0x42, 0x4d]],
  ["webp", [0x52, 0x49, 0x46, 0x46]],
  ["tiff", [0x49, 0x49, 0x2a, 0x00]],
  ["tiff", [0x4d, 0x4d, 0x00, 0x2a]],
];

function sniffExt(bytes: Uint8Array): string | undefined {
  return RASTER_MAGIC.find(([, magic]) => magic.every((b, i) => bytes[i] === b))?.[0];
}

/** Resolves an image source URL against the document base URL. */
export function resolveImageUrl(source: string, baseURL: string): string {
  if (!source || source.startsWith("data:") || source.startsWith("#")) return source;
  try {
    return new URL(source, baseURL).href;
  } catch {
    return source;
  }
}

/** Fetches bytes behind an image URL over HTTP(S) with bounded size and timeout. */
export async function fetchImageBytes(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ bytes: Uint8Array; mime: string; ext: string } | { error: string }> {
  const timeoutMs = options.timeoutMs ?? IMAGE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` };
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) return { error: `exceeds size limit (${len} > ${maxBytes} bytes)` };
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length > maxBytes) return { error: `exceeds size limit (${bytes.length} > ${maxBytes} bytes)` };

    let mime = res.headers.get("content-type")?.split(";")[0]?.trim();
    let ext = sniffExt(bytes);
    if (!ext) {
      const ascii = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
      if (ascii.includes("<svg") || mime === "image/svg+xml") {
        ext = "svg";
        mime = "image/svg+xml";
      }
    }
    if (!ext) return { error: "unsupported or unrecognized image format" };
    mime ??= ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return { bytes, mime, ext };
  } catch (err) {
    if (options.signal?.aborted) throw err;
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Downloads unbundled remote images (`<img src>`, 2x `srcset`/`image-set`, background-image)
 * into data URLs so they are bundled into the generated assets. A failed download keeps
 * today's behaviour and returns a diagnostic warning.
 */
export async function downloadRemoteImages(
  docs: LayoutDoc[],
  baseURL: string,
  options: { allowRemote?: boolean; signal?: AbortSignal } = {},
): Promise<ConversionWarning[]> {
  if (options.allowRemote === false) return [];
  const warnings: ConversionWarning[] = [];
  const cache = new Map<string, { bytes: Uint8Array; mime: string } | null>();

  const getBytes = async (absUrl: string, feature: string) => {
    if (cache.has(absUrl)) return cache.get(absUrl);
    const result = await fetchImageBytes(absUrl, { signal: options.signal });
    if ("error" in result) {
      cache.set(absUrl, null);
      warnings.push({
        source: "capture",
        level: "approximated",
        feature,
        message: `Remote image could not be downloaded: ${absUrl} (${result.error}); fallback retained`,
      });
      return null;
    }
    const data = { bytes: result.bytes, mime: result.mime };
    cache.set(absUrl, data);
    return data;
  };

  for (const doc of docs) {
    const successfulEmbeds = new Set<string>();

    const visit = async (node: LayoutNode, parent?: LayoutNode) => {
      // 1. <img>, <input type=image>, <video poster>
      if (node.tag === "img" || (node.tag === "input" && node.attrs.type === "image") || node.tag === "video") {
        let candidate2x: string | undefined;

        // Check srcset on the img itself
        if (node.attrs.srcset) {
          const parsed = parseSrcset(node.attrs.srcset);
          const cand = select2xCandidate(parsed);
          if (cand && cand.density === 2) candidate2x = cand.url;
        }

        // Check parent picture source elements if img didn't have 2x srcset
        if (!candidate2x && parent?.tag === "picture") {
          for (const s of parent.children) {
            if (s.tag === "source" && s.attrs.srcset) {
              const parsed = parseSrcset(s.attrs.srcset);
              const cand = select2xCandidate(parsed);
              if (cand && cand.density === 2) {
                candidate2x = cand.url;
                break;
              }
            }
          }
        }

        // If a 2x candidate exists, try downloading it
        if (candidate2x) {
          const abs = resolveImageUrl(candidate2x, baseURL);
          if (/^https?:/i.test(abs)) {
            const data = await getBytes(abs, "img");
            if (data) {
              const dataUrl = `data:${data.mime};base64,${Buffer.from(data.bytes).toString("base64")}`;
              node.currentSrc = dataUrl;
              node.attrs["data-markswift-scale"] = "2";
              successfulEmbeds.add(abs);
            }
          }
        }

        // If not bundled as 2x, check the node's currentSrc or src
        const chosenUrl = node.currentSrc ?? node.attrs[node.tag === "video" ? "poster" : "src"];
        if (chosenUrl && !chosenUrl.startsWith("data:") && !chosenUrl.startsWith("#")) {
          const abs = resolveImageUrl(chosenUrl, baseURL);
          if (/^https?:/i.test(abs)) {
            const data = await getBytes(abs, node.tag === "video" ? "video: poster" : "img");
            if (data) {
              const dataUrl = `data:${data.mime};base64,${Buffer.from(data.bytes).toString("base64")}`;
              if (node.tag === "video") node.attrs.poster = dataUrl;
              else if (node.tag === "input") node.attrs.src = dataUrl;
              else node.currentSrc = dataUrl;
              successfulEmbeds.add(abs);
            }
          }
        }
      }

      // 2. CSS background-image and mask-image
      for (const prop of ["background-image", "mask-image"]) {
        const val = node.styles[prop];
        if (!val || val === "none") continue;

        const imageSet = parseImageSet(val);
        if (imageSet) {
          const cand2x = imageSet.find((c) => Math.abs(c.density - 2) < 0.2);
          const pick = cand2x ?? imageSet.find((c) => c.density === 1) ?? imageSet[0];
          if (pick) {
            const abs = resolveImageUrl(pick.url, baseURL);
            if (/^https?:/i.test(abs)) {
              const data = await getBytes(abs, prop);
              if (data) {
                const dataUrl = `data:${data.mime};base64,${Buffer.from(data.bytes).toString("base64")}`;
                node.styles[prop] = `url(${JSON.stringify(dataUrl)})`;
                if (cand2x) node.styles["--markswift-bg-scale"] = "2";
                successfulEmbeds.add(abs);
              }
            }
          }
        } else {
          const matches = [
            ...val.matchAll(/url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g),
          ];
          for (const m of matches) {
            const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
            if (raw && !raw.startsWith("data:") && !raw.startsWith("#")) {
              const abs = resolveImageUrl(raw, baseURL);
              if (/^https?:/i.test(abs)) {
                const data = await getBytes(abs, `${prop}: url()`);
                if (data) {
                  const dataUrl = `data:${data.mime};base64,${Buffer.from(data.bytes).toString("base64")}`;
                  node.styles[prop] = node.styles[prop]!.replace(m[0], `url(${JSON.stringify(dataUrl)})`);
                  successfulEmbeds.add(abs);
                }
              }
            }
          }
        }
      }

      for (const child of node.children) await visit(child, node);
    };

    await visit(doc.root);
  }

  return warnings;
}
