/**
 * How full the river runs, 0..1 — and where it runs.
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

import type { RibbonOptions } from '@/world/water'
import { VALLEY } from '@/systems/terrain'

/** Where the no-goal curve reaches half-full, in minor units (₦50,000). */
const HALFWAY_MINOR = 5_000_000

export function riverFullness(progress: number | null, totalMinor: number): number {
  if (progress !== null) return Math.max(0.06, Math.min(1, progress))
  if (totalMinor <= 0) return 0.06
  // a saturating curve: x / (x + k) — always climbing, never done
  return Math.max(0.06, Math.min(0.95, totalMinor / (totalMinor + HALFWAY_MINOR)))
}

/*
  The channel.

  Here rather than in the scene, because the camera has to know it: the river
  bends now, and a camera that sat at x = 0 stood on the bank looking along
  the water's side. Everything that stands on the bank or floats on the water
  reads the same shape, so the shore and the things on the shore cannot drift
  apart — see `bankAt` in world/water.

  It begins at the spring, forty-odd metres up the valley, and runs on past the
  camera and out of the fog: `HEAD` is where the water comes up.
*/
export const HEAD = -44
export const RUN = 164
export const CHANNEL: RibbonOptions = {
  length: RUN,
  meander: 8,
  width: [7.5, 13],
}
/** The ribbon is centred on its own origin; this puts its head at `HEAD`. */
export const CHANNEL_Z = HEAD + RUN / 2

/** The channel's middle at a world z, the way the ribbon draws it. */
export function channelXAt(z: number): number {
  const t = (z - CHANNEL_Z) / RUN + 0.5
  const meander = CHANNEL.meander ?? 1
  return Math.sin(t * 4.1 + 0.6) * meander + Math.sin(t * 9.3 + 2.2) * meander * 0.32
}

/** Where the surface is, for everything that stands in or on the water. */
export function surfaceAt(fullness: number): number {
  return -VALLEY.depth + 0.55 + fullness * 1.7
}
