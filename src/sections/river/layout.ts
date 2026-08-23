/**
 * How full the river runs, 0..1.
 *
 * Two ways of reading the pot, because the pot can be read two ways:
 *
 *   With a goal set, fullness is progress toward it — the river brims on the
 *   day you reach what you were saving for, which is the whole story.
 *
 *   With no goal, there is nothing to be a fraction *of*. Rather than sit at
 *   zero forever, the river fills on a curve that keeps rewarding deposits
 *   without ever quite arriving: doubling what you have always moves it, and
 *   it never claims you are finished when there is nothing to finish.
 */

/** Where the no-goal curve reaches half-full, in minor units (₦50,000). */
const HALFWAY_MINOR = 5_000_000

export function riverFullness(progress: number | null, totalMinor: number): number {
  if (progress !== null) return Math.max(0.06, Math.min(1, progress))
  if (totalMinor <= 0) return 0.06
  // a saturating curve: x / (x + k) — always climbing, never done
  return Math.max(0.06, Math.min(0.95, totalMinor / (totalMinor + HALFWAY_MINOR)))
}
