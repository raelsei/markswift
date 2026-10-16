/** Breakpoint planning: which viewport widths capture every CSS width band of a page (D-BREAKPOINTS). */
import { captureWidth, widthQuery } from "../css/index.ts";
import type { LayoutCondition } from "../model/layout.ts";
import type { BandEdge } from "../model/semantic.ts";

/** Narrowest width a band covers: thresholds at or below it never switch a phone layout. */
export const BAND_MIN = 320;
/** Most captures one conversion makes. */
export const BAND_CAP = 6;
export const DEFAULT_BAND_DEVICES: ReadonlyArray<{ width: number; height: number }> = [
  { width: 390, height: 844 },
  { width: 834, height: 1210 },
  { width: 1210, height: 834 },
  { width: 1376, height: 1032 },
];

export interface BandPlan {
  /** CSS viewport edges, ascending; `edges.length === captures.length - 1`. */
  edges: BandEdge[];
  captures: Array<{ width: number; height: number }>;
  /** Probe width per band (used only when the band's capture needs a probe). */
  probes: Array<number | undefined>;
  /** Thresholds not reconstructed, as warning messages. */
  notes: string[];
}

/** Tailwind's default breakpoints by `min-width` px. */
export const TAILWIND_BANDS: Record<number, string> = { 640: "sm", 768: "md", 1024: "lg", 1280: "xl", 1536: "2xl" };

/** One name per band: band 0 `""`, band `k` its lower CSS edge — a Tailwind default name, else `w<capture width>`. */
export function bandNames(cssEdges: BandEdge[]): string[] {
  return ["", ...cssEdges.map((e) => (e.inclusive && TAILWIND_BANDS[e.px]) || `w${captureWidth(e)}`)];
}

/** Band edges from the `media` width conditions, one capture and probe width per band. */
export function planBands(
  conditions: LayoutCondition[],
  options: {
    first: { width: number; height: number };
    devices: ReadonlyArray<{ width: number; height: number }>;
    max: number;
  },
): BandPlan {
  const { first, devices, max } = options;
  const notes = new Map<string, string>();
  const all: BandEdge[] = [];
  for (const c of conditions) {
    const q = c.kind === "media" ? widthQuery(c.query) : undefined;
    for (const e of q ? [q.above, q.below] : []) {
      if (!e) continue;
      const w = captureWidth(e);
      if (w > BAND_MIN && w <= max) all.push(e);
      else if (!notes.has(c.query))
        notes.set(
          c.query,
          `@media ${c.query}: width threshold ${e.px}px is outside the ${BAND_MIN}–${max}px band range; the view does not switch there`,
        );
    }
  }
  all.sort((a, b) => captureWidth(a) - captureWidth(b) || Number(b.inclusive) - Number(a.inclusive));
  let edges = all.filter((e, i) => i === 0 || captureWidth(e) !== captureWidth(all[i - 1]!));
  if (edges.length > BAND_CAP - 1) {
    notes.set(
      "",
      `${edges.length + 1} width bands exceed the ${BAND_CAP}-capture limit; thresholds from ${edges[BAND_CAP - 1]!.px}px up are not reconstructed`,
    );
    edges = edges.slice(0, BAND_CAP - 1);
  }
  if (!edges.length)
    return { edges, captures: [first], probes: [first.width > BAND_MIN ? BAND_MIN : 390], notes: [...notes.values()] };
  const captures: BandPlan["captures"] = [];
  const probes: BandPlan["probes"] = [];
  for (let i = 0; i <= edges.length; i++) {
    const lo = i === 0 ? BAND_MIN : captureWidth(edges[i - 1]!);
    const hi = i === edges.length ? max : captureWidth(edges[i]!) - 1;
    const inBand = (w: number) => lo <= w && w <= hi;
    const capture = inBand(first.width)
      ? first
      : (devices.find((d) => inBand(d.width)) ?? { width: lo, height: first.height });
    captures.push(capture);
    const [near, far] = i === 0 ? [BAND_MIN, hi] : [hi, lo];
    probes.push(near !== capture.width ? near : far !== capture.width ? far : undefined);
  }
  return { edges, captures, probes, notes: [...notes.values()] };
}
