/**
 * The two halves of "she is writing", as hooks.
 *
 * -----------------------------------------------------------------------------
 * One to report and one to read, so a composer says `useReportTyping(draft)`
 * and a place that wants to show it says `useTheyAreTyping()`, and neither has
 * to know anything about presence, throttling or freshness. All of the
 * arithmetic is in `systems/typing`, which is where the harness points.
 *
 * There are three composers in this garden — the Stars, the corner whisper, and
 * the film chat — and they are three completely different components that share
 * nothing else. That is exactly the situation where the same logic ends up
 * written three times with two of them subtly wrong, so it is written once
 * here and spread by import.
 * -----------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { FRESH_FOR, isTyping, makeReporter, otherThan } from './typing'

/**
 * Tell her you are writing, while this draft has anything in it.
 *
 * Publishes on the first keystroke, refreshes at most every few seconds, and
 * clears the moment the draft empties — which is what makes sending feel
 * instant, because a message and the news that it is coming must not arrive in
 * that order.
 *
 * `live` lets a composer that is closed stop reporting without unmounting: the
 * corner whisper folds away rather than being removed.
 */
export function useReportTyping(draft: string, live = true) {
  const data = useData()
  const post = useRef(makeReporter())

  useEffect(() => {
    const stamp = live
      ? post.current.onDraft(draft, data.now())
      : post.current.stop()
    if (stamp === null) return
    data.publishPresence({ typing: stamp })
  }, [draft, live, data])

  /*
    And on the way out.

    A composer can be unmounted with a half-written draft in it — you close the
    Stars, you leave the film — and without this the last thing sent would be
    "still writing", which then has to time out. Clearing costs one write and
    makes the common case instant.
  */
  useEffect(
    () => () => {
      const stamp = post.current.stop()
      if (stamp !== null) data.publishPresence({ typing: stamp })
    },
    [data],
  )
}

/**
 * Is she writing something, right now?
 *
 * -----------------------------------------------------------------------------
 * Re-checked on a timer as well as on presence changes, and it has to be:
 * `typing` is a *timestamp*, so it goes stale with no new data arriving. A
 * component that only re-rendered when presence changed would keep showing the
 * indicator until she moved, which on a phone sitting on a table is never.
 *
 * The timer only runs while the answer is true, so a quiet garden costs
 * nothing — this is the difference between a second of work an hour and a
 * second of work a second.
 * -----------------------------------------------------------------------------
 */
export function useTheyAreTyping(): boolean {
  const data = useData()
  const presence = useWorldSlice((s) => s.presence)
  const them = presence[otherThan(data.me)]
  const [, tick] = useState(0)

  const on = isTyping(them, data.now())

  useEffect(() => {
    if (!on) return
    /*
      Checked a few times inside the window rather than once at the end of it.
      Waking exactly when the stamp expires would need a timer per report and
      would be wrong by however long the frame took; four looks over seven
      seconds costs nothing and can never be late by more than two.
    */
    const stop = window.setInterval(() => tick((n) => n + 1), FRESH_FOR / 4)
    return () => window.clearInterval(stop)
  }, [on])

  return on
}
