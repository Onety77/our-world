/**
 * Sitting in a live round, as React sees it.
 *
 * The protocol — what a key means, what readiness looks like on the wire and
 * how two devices reach the same instant — is in `systems/lobby`, which has
 * no imports at all so it can be checked headlessly by `npm run lobby`. This
 * is the part that needs presence, a clock and a re-render.
 */

import { useEffect, useMemo, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { agreedStart, readSitting, writeSitting } from './lobby'

export interface Lobby {
  /** She is holding the same key. */
  sheIsHere: boolean
  sheIsReady: boolean
  youAreReady: boolean
  /**
   * The agreed instant, in server milliseconds, or null while anybody is not
   * ready. Both devices compute the same number from the same two timestamps.
   */
  startAt: number | null
  /** Milliseconds until the flag, or null. Recomputed a few times a second. */
  countdown: number | null
  /** True once the moment has passed and the race should be running. */
  go: boolean
  ready(): void
  /** Take it back, while there is still a countdown to take it back from. */
  wait(): void
}

/**
 * Sit in a round and watch for her.
 *
 * `key` null means you are not in a live round at all, and this does nothing —
 * so a component can call it unconditionally and let the key decide.
 */
export function useLobby(key: string | null): Lobby {
  const data = useData()
  const me = data.me
  const them = otherUser(me)
  const presence = useWorldSlice((s) => s.presence)

  const mine = useMemo(() => readSitting(presence[me]?.racing), [presence, me])
  const hers = useMemo(() => readSitting(presence[them]?.racing), [presence, them])

  const sheIsHere = key !== null && hers?.key === key
  const youAreReady = key !== null && mine?.key === key && mine.readyAt !== null
  const sheIsReady = sheIsHere && hers?.readyAt !== null

  /*
    The last of the two to press is the one the flag hangs off.

    Taking the later of the two rather than either one on its own is what makes
    both phones agree: whichever order the two presses arrive in, and whichever
    device is asked, the answer is the same number.
  */
  const startAt = key === null ? null : agreedStart(key, mine, hers)

  /*
    The countdown is state rather than a derived value, because it has to
    change without anything else changing — nothing is written anywhere between
    "three" and "go".
  */
  const [countdown, setCountdown] = useState<number | null>(null)
  useEffect(() => {
    if (startAt === null) {
      setCountdown(null)
      return
    }
    const tick = () => setCountdown(Math.max(0, startAt - data.now()))
    tick()
    // Eight a second: fine enough that the number never appears to stick, and
    // coarse enough to be nothing next to a frame of the world.
    const timer = window.setInterval(tick, 125)
    return () => window.clearInterval(timer)
  }, [startAt, data])

  return {
    sheIsHere,
    sheIsReady,
    youAreReady,
    startAt,
    countdown,
    go: startAt !== null && countdown !== null && countdown <= 0,
    ready() {
      if (key === null) return
      data.publishPresence({ racing: writeSitting(key, data.now()) })
    },
    wait() {
      if (key === null) return
      data.publishPresence({ racing: writeSitting(key, null) })
    },
  }
}
