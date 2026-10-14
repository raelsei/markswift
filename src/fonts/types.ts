import type { FaceMetrics } from "../model/fonts.ts";
import type { ConversionWarning } from "../model/semantic.ts";

/** A face bundled with the generated Swift; its bytes are `FontPackage.assets["Fonts/<file>"]`. */
export interface PackagedFace {
  /** CSS family name — what `font-family` declarations say and what the emitter emits. */
  family: string;
  /** File name under `Fonts/`. */
  file: string;
  style: "normal" | "italic" | "oblique";
  /** `font-weight` range the face covers; `[400, 400]` for a static face. */
  weight: [number, number];
  /** Variation axis ranges, by tag (`wght`, `opsz`, `wdth`); empty for a static face. */
  axes: Record<string, [number, number]>;
  metrics: FaceMetrics;
  /** Source format was WOFF/WOFF2 and the file was decompressed to sfnt. */
  converted: boolean;
  /** The name table was rewritten so the CSS family name resolves. */
  renamed: boolean;
}

export interface FontPackage {
  faces: PackagedFace[];
  /** `Fonts/<file>` → bytes to ship; exactly one entry per packaged face. */
  assets: Record<string, Uint8Array>;
  /** `Info.plist` `UIAppFonts` fragment; empty when nothing was packaged. */
  plist: string;
  /** What the design asked for and did not get. */
  notes: ConversionWarning[];
}
