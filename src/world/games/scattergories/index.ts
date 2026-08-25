import type { GameDefinition } from '../types'
import Scattergories from './Scattergories'
import ScattergoriesEmblem from './emblem'

/**
 * One person's twelve answers for one round of the match.
 *
 * ---------------------------------------------------------------------------
 * **A match is four round documents, and that is what keeps it sealed.**
 *
 * The security rules withhold the *opening* move of a round — seq 0 — until
 * yours exists. Everything after seq 0 is open, because a turn-based game
 * where you cannot see her turn is not a game.
 *
 * Scattergories is the opposite shape: all four sheets have to be blind, or
 * the second person to play simply reads the first one's list and writes
 * around it, which is not a harder round, it is a different and much worse
 * game. Four sheets at seq 0..3 would leave three of the four readable.
 *
 * So each round of the match is its own round document — `…:2026-08-24` and
 * then `…-r2`, `-r3`, `-r4` — and every sheet is the seq 0 of one of them.
 * The existing seal covers all four with no rules change at all. See
 * `roundIdFor` in the component.
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
  duration: 'four rounds, three minutes each',
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
   * Over when the fourth round has been written by both of you.
   *
   * The generic rule — one move each — would settle the match the moment the
   * first sheets landed, and pay the pollen out three rounds early.
   */
  isSettled({ mine, theirs, solo }) {
    const sheets = (moves: ScatterMove[]) =>
      new Set(moves.filter((m) => m?.kind === 'sheet').map((m) => (m as Sheet).round))
    // Only round one lives in this document; the rest are their own. Settling
    // on round one is the honest thing this document can say.
    return sheets(mine).has(0) && (solo || sheets(theirs).has(0))
  },

  Emblem: ScattergoriesEmblem,
  Component: Scattergories,
} satisfies GameDefinition<ScatterSetup, ScatterMove>
