/**
 * Running one round of one game.
 *
 * Everything awkward about async play lives here so that no game has to think
 * about it: naming the round the same on both devices, opening it exactly
 * once, watching it, and paying out exactly once when it settles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import type { Round, UserId } from '@/data/types'
import { localDateKey } from '@/systems/time'
import { seedFromId, type GameCadence, type GameDefinition } from './types'

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
 * How a round stands, without opening it.
 *
 * ---------------------------------------------------------------------------
 * **Four states, and every one of them is something you are allowed to know.**
 *
 * This is the whole difficulty, and it is why the states are worded the way
 * they are. The security rules withhold her *opening* move until yours exists
 * — that is the seal — so before you have played, "has she been?" genuinely
 * has no answer on your device. `watchRound` reports an empty move list in
 * that case, which is correct and is not the same as "she has not played".
 *
 * So the list never claims anything about her until you have moved:
 *
 *   nothing   the round has not been opened by either of you today
 *   yours     you have not played it. Whether she has is sealed, and saying
 *             "your move" is true either way, which is why that is the wording
 *   hers      you have played and she has not — knowable, because the seal
 *             lifts the moment your own opening move lands
 *   both      you have both been here today
 *
 * That last one is the point of the whole feature. The note at the top of
 * `Round` in `data/types.ts` says it: the good feeling in an asynchronous game
 * is not winning, it is opening the Hollow and seeing that she has been. Until
 * now the Hollow could not show you that without your opening every game in it
 * one at a time and reading what each one said.
 *
 * **Read-only, and that matters.** It deliberately does not call `openRound`.
 * Merely looking at what is waiting must not create a round — otherwise every
 * glance at the list would write a document for a game you never played.
 * ---------------------------------------------------------------------------
 */
export type Turn = 'nothing' | 'yours' | 'hers' | 'both'

/** Where a round stands, from your side of the seal. Pure, so it is testable. */
export function turnOf(round: Round | null, me: UserId): Turn {
  if (!round) return 'nothing'
  const them = me === 'warm' ? 'cool' : 'warm'
  const mine = round.moves.filter((m) => m.by === me).length
  if (mine === 0) return 'yours'
  const theirs = round.moves.filter((m) => m.by === them).length
  return theirs === 0 ? 'hers' : 'both'
}

/**
 * A game the standings list watches. Only the three fields it needs, so the
 * pure part below can be exercised without building a whole definition.
 */
export interface Listed {
  id: string
  cadence: GameCadence
  isDone?(state: { mine: never[]; theirs: never[] }): boolean
}

/**
 * Whose move it is, *and* whether you are finished with it.
 *
 * ---------------------------------------------------------------------------
 * Two separate facts, because they are separately true and the list needs both.
 *
 * `turnOf` counts moves, which is all the seal lets it do, and by that measure
 * "you have both been here today" is the end of the story. It is not: you can
 * have spent all six guesses an hour ago and the line would still read as
 * though the game were sitting there with something in it for you. That is the
 * one state the list was getting wrong, and it is the state you are in every
 * time you actually finish something.
 *
 * The game answers the second half — see `isDone` on GameDefinition — because
 * only it knows what over means. A game that doesn't answer is never done, and
 * the list reads exactly as it did before.
 * ---------------------------------------------------------------------------
 */
export interface Standing {
  turn: Turn
  /** Your side of it is over. Says nothing about hers. */
  done: boolean
}

/** Pure, so it is testable. */
export function standingOf(
  round: Round | null,
  me: UserId,
  isDone?: Listed['isDone'],
): Standing {
  const turn = turnOf(round, me)
  // Nothing opened, or you have not played: there is nothing to be done with.
  if (!round || !isDone || turn === 'nothing' || turn === 'yours') {
    return { turn, done: false }
  }
  const them = me === 'warm' ? 'cool' : 'warm'
  const pick = (who: UserId) =>
    round.moves.filter((m) => m.by === who).map((m) => m.data) as never[]
  return { turn, done: Boolean(isDone({ mine: pick(me), theirs: pick(them) })) }
}

/**
 * Where today's round stands in every game at once.
 *
 * One hook and one effect for all of them, rather than a hook per game. Two
 * reasons and the second is the one that decided it: calling a hook inside a
 * loop over the registry is a rule nobody should have to reason about even
 * when the array happens to be constant — and, more usefully, the *summary*
 * needs all of them before the list is ever opened, so the watchers cannot
 * belong to the rows.
 *
 * Keyed by game id. A game with no round yet is simply absent, which reads as
 * 'nothing'.
 */
export function useStandings(games: readonly Listed[]): Record<string, Standing> {
  const data = useData()
  const me = data.me
  const zone = useWorldSlice((s) => s.profiles[me].timeZone)
  const [turns, setTurns] = useState<Record<string, Standing>>({})

  const ids = useMemo(
    () =>
      games.map((game) => ({
        game: game.id,
        isDone: game.isDone,
        // The same key `ui/Playing` opens, so these are genuinely the rounds
        // you would walk into rather than a second idea of which is today's.
        id: `${game.id}:${game.cadence === 'daily' ? localDateKey(zone) : 'current'}`,
      })),
    [games, zone],
  )

  useEffect(() => {
    setTurns({})
    const offs = ids.map(({ game, id, isDone }) =>
      data.watchRound(id, (round) =>
        setTurns((prev) => ({ ...prev, [game]: standingOf(round, me, isDone) })),
      ),
    )
    return () => offs.forEach((off) => off())
  }, [data, me, ids])

  return turns
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
