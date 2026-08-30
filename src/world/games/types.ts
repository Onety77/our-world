import type { ComponentType } from 'react'
import type { Later } from '@/systems/later'
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
 * Something that has to be settled *before* an invitation is sent.
 *
 * ---------------------------------------------------------------------------
 * A live round is agreed through `Presence.racing`: one of you writes a key,
 * the other sees it and joins. That works for a game where there is nothing to
 * agree about beyond the moment — Scattergories deals the same letters from
 * the key and there is nothing else to decide.
 *
 * The racer has three roads. Somebody has to choose, and the choice has to be
 * made *before* the invitation, because the key is the invitation: publish a
 * key with no road on it and she can join a round that does not yet know where
 * it is. Re-keying afterwards would strand her on the old one.
 *
 * So a game may declare what it needs picked, the Hollow asks, and the answer
 * goes into the key — see `raceKey` in `systems/lobby`. Nothing is written
 * anywhere until the road is known.
 * ---------------------------------------------------------------------------
 */
export interface LiveChoice {
  /** Goes into the round key, so it must be short and URL-ish. */
  id: string
  name: string
  /** A short distinction for a one-at-a-time choice screen. */
  note?: string
}

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
  /**
   * What the ordinary, asynchronous way in is called *here*.
   *
   * The one that matters, because it is the one that will actually be used —
   * Lagos and Shanghai share a sliver of evening, so nearly every round starts
   * with one of you alone. The shell used to write "vs {her name}" over it,
   * which is true of a duel and says nothing at all about what pressing it
   * *does*: in Word Duel it leaves her a word to come back to, and in the
   * racer it puts a line down the Rootway for her to chase. Those are the
   * things somebody is deciding between, and a shell cannot name them.
   *
   * Left out, it falls back to "play with {her name}", which is at least not
   * wrong.
   */
  invite?: {
    /** The verb. Lower case; `{them}` is replaced with her name. */
    name: string
    /** One line, on hover, saying what happens next. */
    tip: string
  }
  /**
   * What the live way in is called *here*, and what it promises.
   *
   * The Hollow used to call it "time challenge" for every game there is,
   * because the first live round ever built was Word Duel's five-minute one
   * and the shell learned the name from it. Then the racer got a live round
   * and inherited a label describing a clock it does not have — the two of you
   * on the same road at the same moment is not a time challenge, and calling
   * it one is the shell telling the player something untrue about their game.
   *
   * A game with no live round leaves this out and does not get the button.
   */
  live?: {
    /** The verb on the button. Lower case; the row sets its own case. */
    name: string
    /** One line, on hover, saying what it actually is. */
    tip: string
    /**
     * Asked before the invitation is sent, and folded into the round key.
     *
     * Omitted by every game that has nothing to settle first, which is most of
     * them — the Hollow then behaves exactly as it always has.
     */
    choose?: { prompt: string; options: readonly LiveChoice[] }
  }
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

  /**
   * The game, as one small object, for the row you choose it from.
   *
   * -------------------------------------------------------------------------
   * **Games were being chosen from a paragraph.** The Hollow listed each one
   * as a title, two lines of description and three words in small capitals,
   * which is a settings screen. Nothing about it looked like a thing you
   * *play* — and with more than one game in the row there was no way to tell
   * them apart at a glance at all, because both were a block of text in the
   * same face at the same size in the same place.
   *
   * So each game draws itself. Not a screenshot and not an icon — *the game's
   * own object*, made of the same parts the game is made of: Word Duel is
   * stones, because its board is stones; the Rootway is two pairs of headlamps
   * in the dark, because that is the whole picture of the race. Both are a
   * handful of gradients, so they are sharp at any size, cost nothing to load,
   * and cannot go stale the way a screenshot does.
   *
   * It belongs on the definition rather than in the Hollow for exactly the
   * reason `Component` and `Stage` do: adding a game must never mean editing a
   * switch somewhere else. A game with no emblem still lists — it just gets a
   * quieter entry, which is honest rather than broken.
   * -------------------------------------------------------------------------
   */
  Emblem?: ComponentType

  /*
    ------------------------------------------------------------------------
    `Component` and `Stage` are the only two things in a game definition that
    are fetched rather than shipped — see `later` in `systems/later`.

    Everything above them stays eager, and the line between the two is not
    about size, it is about *when it is read*. The Hollow draws a row of games
    before you have chosen one: their names, what they cost you in minutes,
    what the two ways in are called, and the little emblem on the card. A name
    you have to download is a name that is not there. But only one game is ever
    played, and Ember Rally alone — its physics, both roads, the car, the
    materials, the audio — is a quarter of everything this garden's own code
    weighs. It has no business being downloaded by somebody walking to the
    river.

    `Emblem` stays eager despite being a component, because it is drawn *on*
    the card, in the row, before any choice is made. It is a few lines of SVG.
    ------------------------------------------------------------------------
  */

  Component: Later<GameProps<Setup, MoveData>>

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
  Stage?: Later
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
