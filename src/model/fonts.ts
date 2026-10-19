/** Font data passed explicitly through one conversion. No process-wide state. */
export interface BundledFamily {
  /** Width-descriptor alternatives, registered with distinct native family names. */
  widths?: Array<{ name: string; stretch: [number, number] }>;
  /** `font-weight` range the family covers; `[400, 400]` for a single static face. */
  weight: [number, number];
  /** `wght` axis range, when the file has one; without it each weight is its own static face. */
  wght?: [number, number];
  /** `opsz` axis range, when the file has one — `font-size` is clamped into it. */
  opsz?: [number, number];
  /** Variation axes other than `wght`/`opsz` the file declares (`wdth`, `GRAD`, …), by tag. */
  axes?: Record<string, [number, number]>;
}

export type BundledFamilies = Readonly<Record<string, BundledFamily>>;

/**
 * Vertical metrics of a packaged face, in font units (`upem`). `descent` is absolute
 * (positive-down). The pair is the one the rendering engine uses: `OS/2` sTypo* when
 * `fsSelection` bit 7 (USE_TYPO_METRICS) is set, else `hhea`.
 */
export interface FaceMetrics {
  upem: number;
  ascent: number;
  descent: number;
  lineGap: number;
  useTypoMetrics: boolean;
}

/** Lowercase CSS family name to packaged font metrics. */
export type FontMetrics = Readonly<Record<string, FaceMetrics>>;
