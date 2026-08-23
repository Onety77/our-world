import type { ComponentType } from 'react'
import type { Round, UserId } from '@/data/types'

/**
 * Whether a game needs you both here at once, or is played a move at a time
 * across days.
 *
 * `async` is the default that matters. Lagos is UTC+1 and Shanghai is UTC+8:
 * once one of you has moved, the hours where you are both awake and free are a
 * sliver at each end of the day. A game that needs two people at once is a
 * game you will play four times and then stop. Live games are the treat for
 * the evenings that line up, not the foundation.
 */
export type GameMode = 'live' | 'async'

/**
 * How a game names its rounds.
 *
 *   'daily'   — one a day, on your own local date. The pair of you get the
 *               same round because the id is the date, not a session anyone
 *               had to start.
 *   'endless' — one at a time; a new one opens when the last one settles.
 *
 * The id has to be derivable on both devices without either of them agreeing
 * first, because most of the time only one of you is here.
 */
export type GameCadence = 'daily' | 'endless'

/**
 * What a game is handed.
 *
 * Deliberately not "the game state" — a round is three separate facts, and
 * conflating them is what makes async games feel broken:
 *
 *   the setup    what you are both playing. Written once when the round opens.
 *   your move    yours, or nothing yet.
 *   her move     hers, **or nothing, which does not mean she hasn't played**.
 *
 * That last one is the whole difficulty. Until you have moved, the server will
 * not tell you whether she has — that is the seal, and it is enforced in the
 * security rules, not here. So a game must never render "she hasn't played
 * yet"; the honest words are "nobody knows yet".
 */
export interface GameProps<Setup = unknown, MoveData = unknown> {
  /** Who you are. Games say "you" and "her", never "player 1". */
  me: UserId
  /** Her name, for anything the game writes about her. */
  theirName: string
  /**
   * Playing on your own.
   *
   * A game that supports it must never write "waiting for her" or seal
   * anything in this mode — there is nobody to wait for, and the round will
   * never receive a second move. It should also not claim to be playing
   * *against* anything clever: the garden has no opponent, only a word bag.
   */
  solo: boolean
  /**
   * Which flavour of round this is: `'race'`, or null for the ordinary one.
   *
   * A game may ignore it entirely — most will. Word Duel uses it to put a
   * five-minute clock on a round the two of you opened at the same moment,
   * which is a different game from the one you play a guess a day.
   */
  variant: 'race' | null

  /** The round as it stands, or null while it is still being opened. */
  round: Round | null
  /** The setup, typed. Null until the round exists. */
  setup: Setup | null

  /** Your moves, oldest first. */
  mine: MoveData[]
  /**
   * Hers, oldest first.
   *
   * Her *opening* move — the first one — is absent until yours exists, so that
   * games which need you both to commit blind can have that. Everything after
   * is there as soon as she makes it.
   */
  theirs: MoveData[]

  /** Add a move to the end of the round. */
  play(data: MoveData): Promise<void>

  /**
   * Award pollen into the shared pool. Call it when a round settles, once —
   * games are re-opened and re-read constantly, and pollen that accrues every
   * time you look at an old round is not a reward, it's a leak.
   */
  award(amount: number, reason: string): Promise<void>

  /** Back out. Costs nothing, forfeits nothing, and is never recorded. */
  onLeave(): void
}

export interface GameDefinition<Setup = unknown, MoveData = unknown> {
  /** Must match the folder name. Stable forever: it ends up in saved data. */
  id: string
  name: string
  /** One line, in the second person: "Catch a light. She catches one too." */
  blurb: string
  mode: GameMode
  cadence: GameCadence
  /** Human-readable, for the UI: "a minute", "one a day". */
  duration: string
  /** Position around the Hollow's fire. Lower appears first. */
  order?: number

  /**
   * Build the round's shared setup. Called with a seed derived from the round
   * id, so **it must be pure** — both devices generate this independently and
   * whoever writes second must produce the same thing, or you would each be
   * playing a different board while the app insisted you weren't.
   */
  makeSetup(seed: number): Setup

  /** Override the generic "both moved" rule for multi-stage games. */
  isSettled?(state: { mine: MoveData[]; theirs: MoveData[]; solo: boolean }): boolean

  Component: ComponentType<GameProps<Setup, MoveData>>

  /**
   * A place, mounted inside the world's own Canvas.
   *
   * Optional, and most games will never want it: a board drawn over the
   * firelit cave is the right shape for a word game, and the cave goes on
   * rendering behind it. But a game can also *be* somewhere — Ember Rally is a
   * tunnel you drive through — and then it needs the camera, the whole frame
   * and this renderer rather than one of its own.
   *
   * It takes no props. Everything it needs comes from the game's own store,
   * because a Stage runs at sixty frames a second and React state at sixty
   * frames a second is visible stutter. See `stage.ts` for the flag that says
   * whether it currently owns the screen, and `ember-rally/session.ts` for the
   * shape of the handover.
   */
  Stage?: ComponentType
}

/**
 * A small, stable hash. Used to turn a round id into the seed a setup is built
 * from, so "2026-08-19" always deals the same hand on both phones.
 */
export function seedFromId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
