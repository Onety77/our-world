/**
 * Where each thought's flower grows.
 *
 * A phyllotactic spiral — the arrangement sunflower seeds use. Two properties
 * matter here and nothing else does:
 *
 *   Index n always lands in the same spot, so a new thought never renumbers
 *   the ones already in the ground.
 *
 *   The golden angle means no two neighbours ever line up into rows. A grid of
 *   thoughts would be unbearable; this looks scattered while packing evenly at
 *   any count, whether there are three flowers or three thousand.
 */

import { groundHeight } from '@/systems/terrain'

/**
 * Where the tree's meadow sits, in world metres.
 *
 * **It has to be an offset in X.** The river cuts its valley *along Z* at
 * x = 0 — a trench thirteen metres wide and five deep, with grass stripped out
 * of it by `dryLand` so the water can be seen. An earlier version tried to
 * escape that by moving along Z, which cannot work: the trench runs that way
 * and is endless. It was then set back to the origin on the reasoning that
 * sections are isolated scenes, which is true of what *renders* but not of the
 * terrain — every section still stands on the one shared height function.
 *
 * So the Tree of Thoughts stood at the bottom of the river's channel, five
 * metres below its own flowers (which are laid on the real ground) and with
 * every blade of grass around it suppressed. The great tree in the bright
 * meadow had no meadow.
 *
 * Two hundred and twenty is well past the banks at thirty, on open ground with
 * a gentle three metres of roll across the whole clearing.
 */
export const MEADOW_X = 220
export const MEADOW_Z = 0

/** The height of the ground the tree actually stands on. */
export const MEADOW_Y = groundHeight(MEADOW_X, MEADOW_Z)

/** ~137.5°, the angle that never repeats a spoke. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** Nothing grows inside this, so the trunk keeps its feet. */
const CLEAR = 2.6
/** How quickly the spiral widens. Bigger = sparser. */
const SPREAD = 0.62

export function thoughtSpot(index: number): [number, number, number] {
  const r = CLEAR + SPREAD * Math.sqrt(index + 1) * 2.4
  const a = index * GOLDEN
  const x = MEADOW_X + Math.cos(a) * r
  const z = MEADOW_Z + Math.sin(a) * r
  return [x, groundHeight(x, z), z]
}

/** Radius the flowers currently reach, for framing the camera. */
export function thoughtsRadius(count: number): number {
  return count === 0 ? CLEAR : CLEAR + SPREAD * Math.sqrt(count) * 2.4
}
