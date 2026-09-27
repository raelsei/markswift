import type { AllocationTrack } from "../model/allocation.ts";

const clamp = (value: number, track: AllocationTrack) => Math.max(track.min, Math.min(track.max ?? Infinity, value));

/** CSS flex freeze/redistribute for explicit bases and numeric constraints. */
export function flexAllocatedWidths(available: number, tracks: AllocationTrack[], basisWidth = available): number[] {
  // The browser floors a resolved border-box percentage basis at its padding and border.
  tracks = tracks.map(track => track.basisFraction === undefined ? track
    : { ...track, basis: Math.max(track.inset ?? 0, track.basis + track.basisFraction * basisWidth) });
  const growing = tracks.reduce((sum, track) => sum + clamp(track.basis, track), 0) < available;
  const target = tracks.map(track => track.basis);
  const frozen = tracks.map(track => (growing ? track.grow : track.shrink) === 0
    || (growing ? track.basis > clamp(track.basis, track) : track.basis < clamp(track.basis, track)));
  frozen.forEach((freeze, i) => { if (freeze) target[i] = clamp(tracks[i]!.basis, tracks[i]!); });
  const initialFree = available - tracks.reduce((sum, track, i) => sum + (frozen[i] ? target[i]! : track.basis), 0);
  for (let step = 0; step <= tracks.length && frozen.some(value => !value); step++) {
    let free = available - tracks.reduce((sum, track, i) => sum + (frozen[i] ? target[i]! : track.basis), 0);
    const factors = tracks.reduce((sum, track, i) => sum + (frozen[i] ? 0 : growing ? track.grow : track.shrink), 0);
    if (factors < 1 && Math.abs(initialFree * factors) < Math.abs(free)) free = initialFree * factors;
    const weight = tracks.reduce((sum, track, i) => sum + (frozen[i] ? 0 : growing ? track.grow : track.shrink * Math.max(0, track.basis - (track.inset ?? 0))), 0);
    const violations = tracks.map((track, i) => {
      if (frozen[i]) return 0;
      const factor = growing ? track.grow : track.shrink * Math.max(0, track.basis - (track.inset ?? 0));
      const allocated = track.basis + (weight > 0 ? free * factor / weight : 0);
      target[i] = clamp(allocated, track);
      return target[i]! - allocated;
    });
    const violation = violations.reduce((sum, value) => sum + value, 0);
    violations.forEach((value, i) => {
      if (Math.abs(violation) < 0.000001 || (violation > 0 ? value > 0 : value < 0)) frozen[i] = true;
    });
  }
  return target;
}

/** CSS fr sizing: a minimum is a floor, never an additive flex basis. */
export function gridAllocatedWidths(available: number, tracks: AllocationTrack[]): number[] {
  const sizes = tracks.map(track => track.min);
  const frozen = tracks.map(track => track.grow === 0);
  for (let step = 0; step <= tracks.length; step++) {
    const free = available - sizes.reduce((sum, size, i) => sum + (frozen[i] ? size : 0), 0);
    const factors = tracks.reduce((sum, track, i) => sum + (frozen[i] ? 0 : track.grow), 0);
    const unit = Math.max(0, free) / Math.max(1, factors);
    let changed = false;
    tracks.forEach((track, i) => {
      if (frozen[i]) return;
      if (unit * track.grow < track.min) { frozen[i] = true; changed = true; sizes[i] = track.min; }
      else sizes[i] = unit * track.grow;
    });
    if (!changed) return sizes;
  }
  return sizes;
}
