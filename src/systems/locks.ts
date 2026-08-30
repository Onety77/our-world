/**
 * Which doors are shut, and to whom.
 *
 * ---------------------------------------------------------------------------
 * **The garden is lived in while it is being built, and that is the whole
 * reason this exists.**
 *
 * She has the app on her phone. When a road is being rebuilt, or a game is
 * half way through a change, the honest move is not to ship it broken and hope
 * she does not open it — it is to take the thing off the wall until it is
 * ready, and put it back when it is.
 *
 * So: one shared document, edited from the control room, listing what is shut.
 * A key is `game:<id>` for a whole game or `road:<stage>` for one of the
 * racer's roads. Absence is the only way to say "open", which means there is no
 * second state that could disagree with itself.
 *
 * **What a shut door does is disappear**, not grey out. A locked game she can
 * see and cannot open is the interface telling her about work in progress,
 * which is a worse thing to look at than a garden with one fewer game in it for
 * a week. See `Locks` in `data/types.ts` for who `them` and `both` mean.
 *
 * Watched here rather than in each screen, because three different places need
 * the same answer and none of them should hold its own listener open for it.
 * ---------------------------------------------------------------------------
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import { useData } from '@/data/provider'
import { shutFor, type Locks } from '@/data/types'

interface Shut {
  locks: Locks
  /** False until the first read has landed. Nothing is hidden before then. */
  known: boolean
  set(locks: Locks): void
}

const useShut = create<Shut>((set) => ({
  locks: {},
  known: false,
  set: (locks) => set({ locks, known: true }),
}))

/**
 * Open the one listener. Mounted once, near the top of the app.
 *
 * Nothing is hidden until the first read lands. A door that fails *shut* would
 * empty the garden the first time a phone loses signal — she opens the Hollow
 * on a train and everything is gone, with no way to tell that from it having
 * been taken away on purpose.
 */
export function useWatchLocks() {
  const data = useData()
  useEffect(() => data.watchLocks((locks) => useShut.getState().set(locks)), [data])
}

/** Everything currently shut, for the control room that edits it. */
export function useLocks(): Locks {
  return useShut((s) => s.locks)
}

/** Is this door shut for me? */
export function useShutFor(key: string): boolean {
  const data = useData()
  return useShut((s) => shutFor(s.locks, key, data.me))
}

/**
 * The same question without a subscription, for lists that are already
 * re-rendering on the locks anyway.
 */
export function useDoorman(): (key: string) => boolean {
  const data = useData()
  const locks = useShut((s) => s.locks)
  return (key) => shutFor(locks, key, data.me)
}

/** `game:word-duel`, `road:moonbreak`. One place that spells them. */
export const gameKey = (id: string) => `game:${id}`
export const roadKey = (stage: string) => `road:${stage}`
