/**
 * Where on the garden the car is, right now.
 *
 * ---------------------------------------------------------------------------
 * A plain object, written once a frame by the race and read by the Nightfall's
 * soundscape — the same shape as `weather.ts`, `tunnel.ts` and `dust.ts`, for
 * the same reason: sixty writes a second are not React state.
 *
 * The Nightfall's sound is not a voice of its own. The road *is* the garden,
 * and the garden already has a sound for every place on it — `ambience.ts`
 * keeps a mix per place and crossfades between them when you walk from one to
 * the next. So the soundscape here is that bed, told where the car is: the
 * meadow's air and leaves, the Wellspring's water, the Hollow's fire and room,
 * the Stars' shimmer, the wood's leaves along the walk. Which is also the only
 * way the road could sound exactly like the place it is a picture of.
 *
 * `place` is the garden's own `Place` id for the stretch the car is on, chosen
 * a little ahead of the car so a crossfade that takes seconds has begun by the
 * time the eye arrives.
 * ---------------------------------------------------------------------------
 */

import type { Place } from '../../../systems/ambience'
import { NIGHTFALL } from './track'

export const garden = {
  /** Metres along the road. */
  s: 0,
  /** True car speed in metres per second. */
  speed: 0,
  /** The garden place the road is passing through, a little ahead of the car. */
  place: 'garden' as Place,
}

/** What the bridge last told the bed, for a headless check; never read by rendering. */
export const nightfallSoundTelemetry = { place: '' as Place | '', changes: 0 }

if (import.meta.env?.DEV) {
  const host = globalThis as typeof globalThis & { __rallySound?: Record<string, unknown> }
  host.__rallySound = host.__rallySound ?? {}
  host.__rallySound.nightfall = nightfallSoundTelemetry
}

/**
 * Which of the garden's places a metre of the Nightfall belongs to.
 *
 * The Tree of Thoughts has its own bed — more leaves, a trace of room from the
 * crown overhead — and gets it for the Tree Turn and the approach to it; the
 * rest of the Meadow is the open garden. The seams are the road's own marks,
 * so the sound changes where the light does.
 */
export function gardenPlaceAt(s: number): Place {
  const M = NIGHTFALL
  if (s >= M.stars.to) return 'lanterns'
  if (s >= M.hollow.to - 12) return 'stars'
  if (s >= M.hollow.from + 12) return 'hollow'
  if (s >= M.wellspring.from) return 'river'
  if (s >= M.treeTurn.from - 50 && s < M.treeTurn.to + 30) return 'tree'
  return 'garden'
}
