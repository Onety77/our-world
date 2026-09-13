/**
 * How the great tree moves in the wind — stated once, for the bark, the leaves
 * and the threads hung from it.
 *
 * ---------------------------------------------------------------------------
 * **Three things have to agree about where a branch is, and they used to be
 * three different answers.** The wood bent at one rate, the leaves at nearly
 * twice it — so the crown slid off its own twigs in a gust — and the threads
 * the thoughts hang on were tied to where the branch had been when the tree was
 * grown, so a knot floated clear of its limb every time the wind blew.
 *
 * Now there is one bend. The shader in `TreeOfLetters` computes it on the GPU
 * and `bendAt` computes the same number on the CPU for the threads, from the
 * same clock, so a knot stays on its branch and a branch a thread is lying
 * over moves the thread with it.
 * ---------------------------------------------------------------------------
 */

/** Metres of travel at ten metres up, in full wind. An old tree holds; its crown moves. */
export const TREE_SWAY = 0.24
/** One phase for the whole tree, so its parts move together. */
export const TREE_PHASE = 1.3

/** The one clock the tree and its threads read. Advanced by `TreeOfLetters`. */
export const treeClock = { t: 0, wind: 1 }

/**
 * The bend coefficient right now: multiply by height² for the sideways travel
 * in x (and 0.4 of it in z) of anything on the tree at that height above its foot.
 *
 * Must match `TREE_VERT` exactly.
 */
export function bendNow(foot: readonly [number, number, number], t = treeClock.t): number {
  const gust = Math.sin(t * 0.31 + foot[0] * 0.03 + foot[2] * 0.024) * 0.5 + 0.5
  const sway = Math.sin(t * 0.61 + TREE_PHASE) * 0.6 + Math.sin(t * 1.13 + TREE_PHASE * 1.4) * 0.25
  return sway * (0.35 + gust * 0.8) * treeClock.wind * TREE_SWAY * 0.01
}
