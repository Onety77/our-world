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
  /**
   * True once the moment has passed, and true from then on.
   *
   * Latched rather than derived, because `startAt` is read out of presence and
   * presence is cleared the moment anybody leaves the game. Deriving it would
   * mean the flag un-dropping underneath a round already being played.
   */
  go: boolean
  /** The instant it dropped at, kept for anything timing itself from there. */
  flagAt: number | null
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
  const youAreHere = key !== null && mine?.key === key
  const youAreReady = youAreHere && mine?.readyAt !== null
  const sheIsReady = sheIsHere && hers?.readyAt !== null

  /*
    Announcing yourself, once, on arrival.

    The door writes the key when you open a live round, which is enough for a
    game with one flag in it. It is not enough for a game with a flag before
    every round: the second round's key has never been through the door, so
    without this each of you would sit in an empty room, ready, watching a lamp
    that says the other one is not here — because neither of you had said so.

    Guarded on `youAreHere` rather than run on mount, so it can only ever add
    a key that is missing. Writing unconditionally would clear your own
    readiness on any re-render that happened to follow it, which is a countdown
    that resets itself the moment it starts.
  */
  useEffect(() => {
    if (key === null || youAreHere) return
    data.publishPresence({ racing: writeSitting(key, null) })
  }, [key, youAreHere, data])

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

  /*
    The flag, and why it is a timeout rather than a comparison.

    It has to survive presence going away — see `go` above — and it equally has
    to be cancellable, because "not yet" during a countdown must actually stop
    it. A latch that ignores `startAt` once set would make the first
    unstoppable and the second impossible. So nothing is remembered until the
    moment arrives: while it is still coming, this follows `startAt` exactly
    and the cleanup cancels a countdown either of you takes back. Once it
    fires, the number is kept and never consulted again.
  */
  const [flagAt, setFlagAt] = useState<number | null>(null)
  const [dropped, setDropped] = useState(false)
  useEffect(() => {
    if (dropped || startAt === null) return
    const fire = () => {
      setFlagAt(startAt)
      setDropped(true)
    }
    const left = startAt - data.now()
    if (left <= 0) {
      fire()
      return
    }
    const timer = window.setTimeout(fire, left)
    return () => window.clearTimeout(timer)
  }, [dropped, startAt, data])

  return {
    sheIsHere,
    sheIsReady,
    youAreReady,
    startAt,
    countdown,
    go: dropped,
    flagAt,
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
