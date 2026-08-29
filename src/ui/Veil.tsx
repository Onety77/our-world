/**
 * The fade between places, and the wait when there is one.
 *
 * The world swaps at the darkest point of this, so it exists to hide a cut —
 * but it should read as the light changing rather than as a loading screen.
 * Hence the colour: not black, but the deep green-dark the whole world sits
 * on, so it feels like passing through shade.
 *
 * ---------------------------------------------------------------------------
 * **It also has to be allowed to wait**, which it did not used to be.
 *
 * The fade was a stopwatch: darken, wait `FADE_MS / 2`, lighten. That is
 * exactly right for hiding a cut between two things that both already exist,
 * and it was right for as long as every place was in memory. Once places
 * became things that are fetched, the stopwatch could finish before the place
 * arrived — so the fade lifted onto whatever the Suspense fallback was, and a
 * moment later the real place replaced it. A flash of the wrong world.
 *
 * So the dark is now held by *either* clock: the fade's own, or for as long as
 * anything is still on its way. On a warm visit — which is nearly all of them
 * — the second is never true for a single frame and this behaves exactly as it
 * did before.
 *
 * **And if the wait is long enough to notice, it says so.** Not immediately:
 * a word that appears on every transition for eighty milliseconds is a flicker
 * of text, which is the thing being fixed wearing a different coat. It waits
 * out a grace period first, so the only time anybody reads it is the time
 * somebody is genuinely sitting there wondering whether it has broken.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import { FADE_MS, useSections } from '@/systems/sections'
import { useArriving } from '@/systems/arriving'
import { usePlaying } from '@/systems/playing'

/**
 * How long a wait has to last before it is worth mentioning.
 *
 * Comfortably longer than the fade itself, so a place that arrives on time
 * never shows a word — the message is for the cold morning, not for the
 * ordinary case.
 */
const SAY_SOMETHING_AFTER = 900

/**
 * How long nothing has to be arriving before the fade is allowed to lift.
 *
 * Long enough to swallow the gap between two chunks resolving back to back,
 * short enough that nobody waits for it on purpose.
 */
const QUIET_FOR = 220

export function Veil() {
  const entered = useSections((s) => s.entered)
  const waiting = useArriving((s) => s.waiting > 0)
  /*
    A game says this for itself, in its own words, from a layer above this one.

    `Playing` puts up "Lighting it." the instant a game's code is asked for,
    and it sits at z-index 9 against this veil's 6 — so without this the slow
    case would stack two loading messages, one of them showing through from
    underneath. The room that owns the screen does the talking.
  */
  const gameIsSpeaking = usePlaying((s) => s.gameId !== null)
  const [fading, setFading] = useState(false)
  const [waited, setWaited] = useState(false)
  /**
   * Still dark, a moment after the last thing landed.
   *
   * -------------------------------------------------------------------------
   * A place is not always one chunk. Two of them resolving a few hundred
   * milliseconds apart would take the fade down, back up, and down again — a
   * flicker, and a worse one than the wait it was trying to hide, because a
   * screen that brightens and darkens reads as something going wrong rather
   * than as something arriving.
   *
   * So the dark is not released the instant nothing is waiting; it is released
   * once nothing has been waiting for a short while. Anything that suspends
   * inside that window is absorbed into the same fade instead of starting a
   * second one.
   *
   * The cost is that a fast load is held very slightly longer than it strictly
   * needs to be, which is the trade asked for: slower, and seamless, rather
   * than quick and flickering.
   * -------------------------------------------------------------------------
   */
  const [settling, setSettling] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setFading(true)
    const id = setTimeout(() => setFading(false), FADE_MS / 2)
    return () => clearTimeout(id)
  }, [entered])

  // The word, only once the wait has gone on long enough to be a wait.
  useEffect(() => {
    if (!waiting) {
      setWaited(false)
      return
    }
    const id = setTimeout(() => setWaited(true), SAY_SOMETHING_AFTER)
    return () => clearTimeout(id)
  }, [waiting])

  // Hold the dark across a gap between two arrivals. See `settling` above.
  useEffect(() => {
    if (waiting) {
      setSettling(true)
      return
    }
    const id = setTimeout(() => setSettling(false), QUIET_FOR)
    return () => clearTimeout(id)
  }, [waiting])

  const dark = fading || waiting || settling
  const speak = waited && !gameIsSpeaking

  return (
    <div
      className={dark ? 'veil dark' : 'veil'}
      style={{ ['--fade' as string]: `${FADE_MS / 2}ms` }}
      /*
        Hidden from a screen reader while it is only a fade, and announced once
        it has become a wait — a decorative rectangle should not be read out
        four times a minute, and a wait that says nothing at all is the same
        silence for somebody who cannot see that the screen has gone dark.
      */
      aria-hidden={speak ? undefined : 'true'}
      role={speak ? 'status' : undefined}
    >
      {speak ? <p className="door-waiting">lighting it…</p> : null}
    </div>
  )
}
