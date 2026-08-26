import { later } from '@/systems/later'
import type { GameDefinition } from '../types'
import WordDuelEmblem from './emblem'

/**
 * What you chose for her. The opening move, and the security rules hold it
 * back until she has chosen too — so neither of you can be influenced by the
 * other's word.
 */
export interface ChoseWord {
  kind: 'word'
  word: string
}

/**
 * One guess at the word you were given.
 *
 * The first one carries `target`, which fixes what you are playing against for
 * the rest of the round. Without it there is a real race: you start guessing a
 * word from the pile because she hadn't left you one, she leaves one a minute
 * later, and your board silently changes underneath you.
 */
export interface Guessed {
  kind: 'guess'
  guess: string
  target?: string
}

export type DuelMove = ChoseWord | Guessed

/** Nothing shared to deal — both words come from the two of you. */
export interface DuelSetup {
  /** Seeds the pile word, so both devices draw the same one. */
  seed: number
}

export default {
  id: 'word-duel',
  name: 'Word duel',
  blurb: 'You pick a word for her, she picks one for you. Six guesses each.',
  mode: 'async',
  cadence: 'daily',
  duration: 'a few minutes, once a day',
  order: 0,
  /*
    A clock is what makes this one different, so a clock is what it is called.
    See `live` on GameDefinition for why the shell no longer names it.
  */
  invite: {
    name: 'leave {them} a word',
    tip: 'She picks yours apart whenever she next comes down here',
  },
  live: { name: 'time challenge', tip: 'Five minutes each, same word' },

  makeSetup(seed) {
    return { seed }
  },

  Emblem: WordDuelEmblem,
  Component: later(() => import('./WordDuel')),
} satisfies GameDefinition<DuelSetup, DuelMove>
