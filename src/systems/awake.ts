/**
 * Keeping the screen alive while something is being watched rather than
 * touched.
 *
 * ---------------------------------------------------------------------------
 * A phone dims and then locks after about thirty seconds of nobody touching
 * it, and it counts steering with a thumb held still, or a film, as nobody
 * touching it. So the screen goes dark in the middle of a race on the one
 * straight long enough to matter, and it goes dark during the quiet half of a
 * film — which on the night screen means it goes dark for the person who is
 * not driving, every time.
 *
 * That is a defect, not a missing feature, and the browser has had the fix for
 * years: `navigator.wakeLock`.
 *
 * **The lock does not survive the page being hidden.** The browser takes it
 * back whenever the tab goes to the background and does *not* return it — so
 * the interesting half of this file is the re-acquiring. Answer a message
 * mid-film and come back, and without the `visibilitychange` handler the
 * screen quietly starts dimming again with everything still looking correct.
 *
 * **Nothing here is announced anywhere.** A phone that stays lit is not a
 * feature somebody should have to find; and where the browser refuses — iOS
 * below 16.4, a battery-saver mode, a device that simply says no — the world
 * behaves exactly as it did before this file existed. There is no message,
 * because there is nothing the person could do about it and no promise was
 * made that is now broken (*honest states*: a switch implying more than a page
 * can do fails silently, at night, for somebody who was waiting).
 * ---------------------------------------------------------------------------
 */

import { useEffect } from 'react'

/*
  `WakeLockSentinel` is in the DOM library, but reaching it through
  `navigator.wakeLock` is not typed in every version of it, and this file must
  compile the same way on both. Narrowed here rather than cast at the call
  site, so the shape being relied on is written down once.
*/
type Sentinel = { released: boolean; release(): Promise<void> }
type WakeLockish = { request(kind: 'screen'): Promise<Sentinel> }

function wakeLock(): WakeLockish | null {
  if (typeof navigator === 'undefined') return null
  const held = (navigator as Navigator & { wakeLock?: WakeLockish }).wakeLock
  return held ?? null
}

/** Whether this device can be asked at all. Nothing depends on knowing. */
export function canStayAwake(): boolean {
  return wakeLock() !== null
}

/**
 * Hold the screen open for as long as `wanted` is true.
 *
 * Use it for the two things in this world that are watched rather than
 * touched: a race in progress, and a film on the night screen. Not for reading
 * — a page of text is a thing you can tap, and a garden that never lets a
 * phone sleep is a garden that flattens a battery in an afternoon.
 */
export function useStayAwake(wanted: boolean): void {
  useEffect(() => {
    const api = wakeLock()
    if (!wanted || !api) return

    let sentinel: Sentinel | null = null
    let dropped = false

    const take = async () => {
      if (dropped || sentinel) return
      try {
        sentinel = await api.request('screen')
        // Released while the request was in flight — let it go rather than
        // holding a lock nothing is going to release.
        if (dropped) {
          void sentinel.release().catch(() => {})
          sentinel = null
        }
      } catch {
        /*
          Refused. A battery saver, a policy, a device that does not want to.
          Not an error anybody can act on: this is the screen behaving the way
          it always used to.
        */
      }
    }

    /*
      The whole reason this is not four lines.

      A hidden page loses the lock and is never given it back, so without this
      the screen stays awake right up until the first time you look at
      something else — which is exactly the moment a film is still playing and
      the other person is still watching it.
    */
    const again = () => {
      if (document.visibilityState !== 'visible') {
        sentinel = null
        return
      }
      void take()
    }

    void take()
    document.addEventListener('visibilitychange', again)

    return () => {
      dropped = true
      document.removeEventListener('visibilitychange', again)
      const held = sentinel
      sentinel = null
      if (held && !held.released) void held.release().catch(() => {})
    }
  }, [wanted])
}
