import type { FaceMetrics } from "../model/fonts.ts";


/** A face that was written next to the generated Swift. */
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
  /** `Info.plist` `UIAppFonts` fragment; empty when nothing was packaged. */
  plist: string;
  /** What the design asked for and did not get, one line each. */
  notes: string[];
}
