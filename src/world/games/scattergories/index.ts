import { later } from '@/systems/later'
import type { GameDefinition } from '../types'
import ScattergoriesEmblem from './emblem'

/**
 * One person's twelve answers for one round of the match.
 *
 * ---------------------------------------------------------------------------
 * **A match is one round document per round, and that is what keeps it sealed.**
 *
 * The security rules withhold the *opening* move of a round — seq 0 — until
 * yours exists. Everything after seq 0 is open, because a turn-based game
 * where you cannot see her turn is not a game.
 *
 * Scattergories is the opposite shape: every sheet has to be blind, or
 * the second person to play simply reads the first one's list and writes
 * around it, which is not a harder round, it is a different and much worse
 * game. Two sheets at seq 0 and seq 1 would leave the second one readable.
 *
 * So each round of the match is its own round document — `…:2026-08-24`, and
 * then `…-r2` for the second, `-r3` for a third if `ROUNDS` ever grows — and
 * every sheet is the seq 0 of one of them. The existing seal covers all of
 * them with no rules change at all, at any number of rounds. See `roundIdFor`
 * in the component.
 * ---------------------------------------------------------------------------
 */
export interface Sheet {
  kind: 'sheet'
  /** 0-based. Redundant with the document it lives in, and worth keeping. */
  round: number
  /** Twelve, in sheet order. A blank is an empty string, never missing. */
  answers: string[]
}

/**
 * Lines of *her* sheet you have challenged.
 *
 * Written after the reveal, so it is never a seq 0 and does not need to be
 * blind — by the time anybody can challenge, both sheets are already open.
 */
export interface Strike {
  kind: 'strike'
  round: number
  /** Indices into her twelve. */
  lines: number[]
}

export type ScatterMove = Sheet | Strike

/** Nothing is dealt from the round document; the seed is the whole setup. */
export interface ScatterSetup {
  seed: number
}

export default {
  id: 'scattergories',
  name: 'Scattergories',
  blurb:
    'One letter, twelve categories, three minutes. Whatever you both wrote scores nothing.',
  mode: 'async',
  cadence: 'daily',
  duration: 'two rounds, three minutes each',
  order: 2,

  invite: {
    name: 'roll for {them}',
    tip: 'You write your three minutes now, she writes hers whenever she comes',
  },
  live: {
    name: 'roll together',
    tip: 'Four rounds, both writing at the same moment',
  },

  makeSetup(seed) {
    return { seed }
  },

  /**
   * Over when the last round has been written by both of you.
   *
   * The generic rule — one move each — would settle the match the moment the
   * first sheets landed, and pay the pollen out before the match was played.
   */
  isSettled({ mine, theirs, solo }) {
    const sheets = (moves: ScatterMove[]) =>
      new Set(moves.filter((m) => m?.kind === 'sheet').map((m) => (m as Sheet).round))
    // Only round one lives in this document; the rest are their own. Settling
    // on round one is the honest thing this document can say.
    return sheets(mine).has(0) && (solo || sheets(theirs).has(0))
  },

  Emblem: ScattergoriesEmblem,
  Component: later(() => import('./Scattergories')),
} satisfies GameDefinition<ScatterSetup, ScatterMove>
