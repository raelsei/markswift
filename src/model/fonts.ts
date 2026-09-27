/** Source face metadata bound to the final font file written by one conversion. */
export interface BundledFontFace {
  weight: [number, number];
  style: "normal" | "italic" | "oblique";
  axes: Record<string, [number, number]>;
  /** Actual fvar defaults in the final asset; absent on legacy metadata. */
  axisDefaults?: Record<string, number>;
  /** Every grouped source variation descriptor; null retains unknown legacy capture state. */
  sourceVariations?: Array<string | null>;
  /** Public name-table ID 6, read after any packaging rename. */
  postScriptName?: string;
  /** SHA-256 of the packaged asset, not its pre-conversion source. */
  assetHash?: string;
}

/** Font data passed explicitly through one conversion. No process-wide state. */
export interface BundledFamily {
  /** `font-weight` range the family covers; `[400, 400]` for a single static face. */
  weight: [number, number];
  /** `opsz` axis range used by the existing automatic font-size route. */
  opsz?: [number, number];
  /** All packaged faces, including non-normal faces and every actual variable axis. */
  faces?: BundledFontFace[];
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
