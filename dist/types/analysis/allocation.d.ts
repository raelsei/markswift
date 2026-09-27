import type { AllocationTrack } from "../model/allocation.ts";
/** CSS flex freeze/redistribute for explicit bases and numeric constraints. */
export declare function flexAllocatedWidths(available: number, tracks: AllocationTrack[], basisWidth?: number): number[];
/** CSS fr sizing: a minimum is a floor, never an additive flex basis. */
export declare function gridAllocatedWidths(available: number, tracks: AllocationTrack[]): number[];
