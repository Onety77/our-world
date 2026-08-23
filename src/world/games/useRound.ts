/**
 * Running one round of one game.
 *
 * Everything awkward about async play lives here so that no game has to think
 * about it: naming the round the same on both devices, opening it exactly
 * once, watching it, and paying out exactly once when it settles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '@/data/provider'
import type { Round } from '@/data/types'
import { seedFromId, type GameDefinition } from './types'

export { localDateKey } from '@/systems/time'

export interface RoundHandle<Setup, MoveData> {
  round: Round | null
  setup: Setup | null
  /** Your moves, oldest first. */
  mine: MoveData[]
  /** Hers. Her opening move is absent until yours is in — see data/types.ts. */
  theirs: MoveData[]
  /** True until the round document exists — a moment on a cold open. */
  opening: boolean
  play(data: MoveData): Promise<void>
}

export function useRound<Setup, MoveData>(
  game: GameDefinition<Setup, MoveData>,
  key: string,
): RoundHandle<Setup, MoveData> {
  const data = useData()
  const id = `${game.id}:${key}`

  const [round, setRound] = useState<Round | null>(null)
  const [opening, setOpening] = useState(true)

  // The setup is derived, not read: both devices build it from the round id
  // and must agree. Recomputing locally also means the round renders instantly
  // on a cold open, before the write has come back.
  const derived = useMemo(() => game.makeSetup(seedFromId(id)), [game, id])

  useEffect(() => {
    let live = true
    setOpening(true)
    setRound(null)

    const stop = data.watchRound(id, (r) => {
      if (!live) return
      setRound(r)
      if (r) setOpening(false)
    })

    void data
      .openRound({ id, gameId: game.id, setup: derived })
      .then(() => {
        if (live) setOpening(false)
      })
      .catch(() => {
        // Losing the race to open is normal and not worth surfacing — the
        // watcher will deliver whichever setup won.
        if (live) setOpening(false)
      })

    return () => {
      live = false
      stop()
    }
  }, [data, id, game.id, derived])

  const play = useCallback(
    async (move: MoveData) => {
      await data.playMove(id, move)
    },
    [data, id],
  )

  const me = data.me
  const them = me === 'warm' ? 'cool' : 'warm'

  const all = round?.moves ?? []

  return {
    round,
    // Prefer what was actually stored, so a setup written by an older version
    // of the game keeps playing correctly rather than being silently replaced
    // half way through by whatever this version would have dealt.
    setup: (round?.setup as Setup | undefined) ?? derived,
    mine: all.filter((m) => m.by === me).map((m) => m.data as MoveData),
    theirs: all.filter((m) => m.by === them).map((m) => m.data as MoveData),
    opening,
    play,
  }
}

/**
 * Pays out once, the first time a round settles, and remembers that it did.
 *
 * Rounds are re-read every time you walk back into the Hollow, so a naive
 * "award when both moves exist" would pay again on every visit — pollen that
 * accrues by looking at an old game is not a reward, it's a leak.
 */
export function useSettlement(
  roundId: string,
  settled: boolean,
  award: (amount: number, reason: string) => Promise<void>,
  compute: () => { pollen: number; reason: string } | null,
) {
  const paid = useRef(new Set<string>())
  const latest = useRef(compute)
  latest.current = compute

  useEffect(() => {
    if (!settled || paid.current.has(roundId)) return
    if (alreadyPaid(roundId)) {
      paid.current.add(roundId)
      return
    }
    const result = latest.current()
    if (!result || result.pollen <= 0) return
    paid.current.add(roundId)
    rememberPaid(roundId)
    void award(result.pollen, result.reason)
  }, [roundId, settled, award])
}

/**
 * Which rounds this device has already paid out for.
 *
 * Deliberately local: it guards against paying twice on *this* phone, which is
 * what actually happens. Both of you being awarded for the same round is
 * correct — the pollen is shared and the round was shared.
 */
const PAID_KEY = 'garden:paid-rounds:v1'

function paidSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PAID_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function alreadyPaid(id: string): boolean {
  return paidSet().has(id)
}

function rememberPaid(id: string) {
  try {
    const all = paidSet()
    all.add(id)
    // Keep the last few hundred; this is a guard, not a history.
    const trimmed = [...all].slice(-400)
    localStorage.setItem(PAID_KEY, JSON.stringify(trimmed))
  } catch {
    /* if it can't remember, the worst case is a second payout. Not fatal. */
  }
}
