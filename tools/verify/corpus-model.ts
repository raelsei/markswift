import type { Rgb, Theme, VisualRegion } from "./visual-fixtures.ts";

/** An authored input, never a converter-produced or score-selected example. */
export interface CorpusFixture {
  id: string;
  name: string;
  category: string;
  structureKey: string;
  features: readonly string[];
  split: "development" | "holdout";
  html: string;
  css: string;
  rootSelector: "#corpus";
  height: number;
  responsive: boolean;
  hosted: boolean;
  background: Record<Theme, Rgb>;
  regions: VisualRegion[];
  /** Difficult browser behavior remains in the manifest and in the denominator. */
  challenge?: string;
}

export interface CorpusExample {
  key: string;
  body: string;
  css?: string;
  features?: readonly string[];
  height?: number;
  hosted?: boolean;
  responsive?: boolean;
  document?: boolean;
  /** Use a visible authored node when the first structural leaf is intentionally hidden. */
  criticalId?: string;
  challenge?: string;
}

export interface CorpusCategory {
  id: string;
  title: string;
  features: readonly string[];
  examples: readonly CorpusExample[];
}

export interface CorpusManifestEntry {
  id: string;
  category: string;
  structureKey: string;
  features: readonly string[];
  split: CorpusFixture["split"];
  height: number;
  responsive: boolean;
  hosted: boolean;
  challenge?: string;
}
