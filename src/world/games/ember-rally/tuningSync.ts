/**
 * The seam between the published car settings and the car.
 *
 * Kept apart from `tuning.ts` on purpose. That file is imported by `physics.ts`
 * and therefore by `scripts/rally-check.ts`, which runs in a bare Node process
 * with no React, no DOM and no Firebase — so it must not know that any of those
 * exist. This one does know, and nothing that drives imports it.
 *
 * Two callers, and they want the same listener for opposite reasons: the racer
 * needs it so the car she drives is the car that was sent to her, and the
 * control room needs it so it can show what has been sent and tell whether the
 * sliders in front of you are still only yours.
 */

import { useEffect } from 'react'
import { useData } from '@/data/provider'
import { useRallyTuning } from './tuning'

/**
 * Listen for the published set for as long as this component is mounted.
 *
 * Safe to call from more than one place at once — each caller gets its own
 * subscription and they all write the same values into the same store.
 *
 * Note what this deliberately does *not* do: it never touches the local draft.
 * A set arriving from the other side updates the published layer underneath,
 * and if this device is in the middle of trying something out, that draft goes
 * on winning until it is dropped. Somebody an hour into tuning a corner should
 * not have the car change under them because the other phone published.
 */
export function usePublishedTuning(): void {
  const data = useData()
  useEffect(() => {
    return data.watchRallyTuning((values) => {
      useRallyTuning.getState().receivePublished(values)
    })
  }, [data])
}
