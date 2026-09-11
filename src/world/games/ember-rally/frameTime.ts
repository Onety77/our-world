/** Preserve ordinary slow frames; discard long pauses rather than racing through them. */
export function raceFrameDelta(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(.1, seconds)) : 0
}
