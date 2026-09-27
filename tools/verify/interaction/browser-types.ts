import type { InteractionStep } from "./types.ts";

export interface BrowserControlObservation {
  tag: string; label: string; value?: string; checked?: boolean; selected?: boolean;
  disabled: boolean; visible: boolean; accessible: boolean; backendNodeID: number;
  rect: { x: number; y: number; width: number; height: number };
  selectedOrdinals?: number[]; scrollTop?: number;
  /** Direct live details.open, also exposed on its first summary trigger. */
  expanded?: boolean;
}
export interface BrowserOracleSnapshot {
  index: number; step?: InteractionStep; gesture?: string;
  controls: Record<string, BrowserControlObservation>; screenshot: string; accessibility: string;
}
export interface BrowserOracle {
  version: 1; fixture: string; browser: string; platform: string;
  multipleSelectionGesture: string; snapshots: BrowserOracleSnapshot[];
}
