import { splitTop } from "../css/syntax.ts";
import { rasterSize } from "../css/raster.ts";
import type { LayoutNode } from "../model/layout.ts";

export interface SrcsetCandidate {
  url: string;
  density?: number;
  width?: number;
}

/** Parses HTML `srcset` attribute into candidates with their density or width descriptor. */
export function parseSrcset(srcset: string): SrcsetCandidate[] {
  if (!srcset || !srcset.trim()) return [];
  const candidates: SrcsetCandidate[] = [];
  const entries = splitTop(srcset, ",");
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const url = parts[0]!;
    let density: number | undefined;
    let width: number | undefined;
    if (parts[1]) {
      const dMatch = /^(\d+(?:\.\d+)?)x$/i.exec(parts[1]);
      if (dMatch) density = parseFloat(dMatch[1]!);
      const wMatch = /^(\d+)w$/i.exec(parts[1]);
      if (wMatch) width = parseInt(wMatch[1]!, 10);
    } else {
      density = 1;
    }
    candidates.push({ url, density, width });
  }
  return candidates;
}

/** Selects the 2x (retina) candidate from srcset candidates; falls back to 1x or the first candidate. */
export function select2xCandidate(candidates: SrcsetCandidate[]): SrcsetCandidate | undefined {
  if (!candidates.length) return undefined;
  const cand2x = candidates.find((c) => c.density !== undefined && Math.abs(c.density - 2) < 0.2);
  if (cand2x) return cand2x;
  return candidates.find((c) => c.density === 1) ?? candidates[0];
}

/**
 * Determines image scale (1, 2, 3) from explicit markup hint, srcset descriptors, or
 * captured natural size vs rendered bounds.
 */
export function determineScale(n: LayoutNode, src: string): number {
  // Set by `downloadRemoteImages` when it bundled a remote 2x candidate.
  if (n.attrs["data-markswift-scale"]) {
    const s = parseFloat(n.attrs["data-markswift-scale"]);
    if (Number.isFinite(s) && s > 0) return s;
  }
  // The 2x `srcset` candidate is the one the browser chose (`currentSrc` is its resolved URL).
  const current = n.currentSrc;
  if (n.attrs.srcset && current) {
    const cand2x = parseSrcset(n.attrs.srcset).find((c) => c.density !== undefined && Math.abs(c.density - 2) < 0.2);
    if (cand2x && (current === cand2x.url || current.endsWith(`/${cand2x.url.replace(/^\.?\//, "")}`))) return 2;
  }
  // Natural vs rendered bounds
  const natural = rasterSize(src);
  if (natural && n.bounds && n.bounds.w > 0 && n.bounds.h > 0) {
    const scaleW = natural.w / n.bounds.w;
    const scaleH = natural.h / n.bounds.h;
    if (Math.abs(scaleW - 2) < 0.25 && Math.abs(scaleH - 2) < 0.25) return 2;
    if (Math.abs(scaleW - 3) < 0.25 && Math.abs(scaleH - 3) < 0.25) return 3;
  }
  return 1;
}
