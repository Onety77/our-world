/**
 * Whether the world is still fetching the place you asked for.
 *
 * ---------------------------------------------------------------------------
 * **This exists because the fade and the load did not know about each other.**
 *
 * Entering a place is three things happening at once: `entered` flips, the
 * veil darkens over half a second and lifts again, and the world swaps
 * underneath it at the darkest point. That is a clean cut, and it worked
 * perfectly for as long as every place was already in memory.
 *
 * Once places became things that are *fetched* — see `later` — a fourth thing
 * could happen, and nothing was arranged for it: the code might not be here
 * yet. The veil went on lifting on its timer regardless, so on a cold cache
 * the sequence was
 *
 *   fade down  →  fade up onto whatever the fallback was  →  snap to the place
 *
 * and the fallback was the garden hub. So you asked for the Stars, watched the
 * meadow fade in, and then had it replaced. Which does not read as loading. It
 * reads as the thing having crashed and recovered.
 *
 * The fix is to let the fade *wait*. A fade that holds until its content
 * arrives is a fade; a fade on a stopwatch is a race between two clocks, and
 * on a slow morning the wrong one wins.
 *
 * **A count rather than a flag**, because there is one boundary today and no
 * reason there will always be one — two overlapping arrivals must not have the
 * first to finish declare that everything has.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

interface Arriving {
  /** How many things are currently being waited for. */
  waiting: number
  /**
   * Say that something is on its way, and get back the way to say it landed.
   *
   * Shaped as acquire-and-release rather than two calls, so a caller cannot
   * hold the veil down for ever by forgetting the second one — the release is
   * the return value, which in React is the cleanup an effect already has to
   * hand back anyway.
   */
  hold(): () => void
}

export const useArriving = create<Arriving>((set, get) => ({
  waiting: 0,
  hold() {
    set({ waiting: get().waiting + 1 })
    let let_go = false
    return () => {
      // Guarded, because an effect cleanup can run twice under StrictMode and
      // a count that goes negative is a veil that never comes down again.
      if (let_go) return
      let_go = true
      set({ waiting: Math.max(0, get().waiting - 1) })
    }
  },
}))
