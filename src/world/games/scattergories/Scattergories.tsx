/**
 * Scattergories, in the Hollow.
 *
 * ---------------------------------------------------------------------------
 * **The real game, and the whole real game.** One letter, twelve categories,
 * five minutes, and two of those to a match. Matching answers cancel, unique
 * ones score, and repeating the letter across a multi-word answer pays extra.
 * What is different is not the rules — it is that the two people playing are
 * seven timezones apart, so a round has to survive one of them being asleep.
 *
 * **A match is one round document per round.** Every sheet is the seq 0 of its
 * own round, which is what the security rules already seal, so hers stays
 * unreadable until yours lands — at any number of rounds, and with no rules
 * change. See the note on `Sheet` in `index.ts`, and `roundIdFor` below.
 *
 * **Everything about a round is derived.** The letter and the twelve
 * categories come out of the match seed, so both phones deal an identical
 * match without speaking. Nothing about the deal is ever written down.
 *
 * `rules.ts` holds the parts worth checking — dealing, what counts as the same
 * answer, and scoring — with no React in them, and `npm run scatter` drives
 * them headless.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { useData } from '@/data/provider'
import type { Round } from '@/data/types'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { Die, Glass, spoken } from './objects'
import {
  GLASS_MS,
  PER_SHEET,
  ROUNDS,
  dealMatch,
  score,
  type Deal,
  type Line,
} from './rules'
import { legKey } from '@/systems/lobby'
import { usePlaying } from '@/systems/playing'
import { useLobby } from '@/systems/useLobby'
import { useSay } from '@/systems/useSay'
import { RaceRoom } from '@/ui/RaceRoom'
import { useMenuKeys } from '@/ui/useMenuKeys'
import type { ScatterMove, ScatterSetup, Sheet, Strike } from './index'

/** The one place the game's name is spelled, since round ids are built from it. */
const GAME_ID = 'scattergories'

/** Where round `n` of a match keyed `key` lives. See the note on `Sheet`. */
function roundIdFor(key: string, n: number): string {
  return `${GAME_ID}:${key}${n === 0 ? '' : `-r${n + 1}`}`
}

const blank = () => Array.from({ length: PER_SHEET }, () => '')

// ---------------------------------------------------------------------------
// The rounds of a match, watched together
// ---------------------------------------------------------------------------

interface RoundState {
  mine: string[] | null
  theirs: string[] | null
  /** Lines of hers you struck, and lines of yours she struck. */
  myStrikes: number[]
  theirStrikes: number[]
}

const empty: RoundState = { mine: null, theirs: null, myStrikes: [], theirStrikes: [] }

/**
 * Every round of the match at once.
 *
 * One effect for the lot rather than a hook per round: a hook in a loop is
 * a rule nobody should have to reason about, and the component needs every
 * round's state to work out which one you are even on.
 *
 * Round one is handed in from the shell, already opened. The other three are
 * opened here, and **only when they are reached** — opening them all up front
 * would write three documents for a match somebody abandoned after one round.
 */
function useMatch(key: string, upTo: number): RoundState[] {
  const data = useData()
  const me = data.me
  const them = me === 'warm' ? 'cool' : 'warm'
  const [rounds, setRounds] = useState<RoundState[]>(() => Array(ROUNDS).fill(empty))

  useEffect(() => {
    const offs: (() => void)[] = []
    for (let n = 1; n <= Math.min(upTo, ROUNDS - 1); n++) {
      const id = roundIdFor(key, n)
      void data
        .openRound({ id, gameId: GAME_ID, setup: { seed: 0 } })
        .catch(() => {
          /* losing the race to open is normal — the watcher delivers either way */
        })
      offs.push(
        data.watchRound(id, (round) =>
          setRounds((prev) => {
            const next = [...prev]
            next[n] = readRound(round, me, them, n)
            return next
          }),
        ),
      )
    }
    return () => offs.forEach((off) => off())
  }, [data, key, me, them, upTo])

  return rounds
}

function readRound(round: Round | null, me: string, them: string, n: number): RoundState {
  if (!round) return empty
  const moves = round.moves
  const sheetOf = (who: string) =>
    (moves.find((m) => m.by === who && (m.data as ScatterMove)?.kind === 'sheet')?.data as
      | Sheet
      | undefined)?.answers ?? null
  const strikesOf = (who: string) =>
    (moves.find((m) => m.by === who && (m.data as ScatterMove)?.kind === 'strike')?.data as
      | Strike
      | undefined)?.lines ?? []
  void n
  return {
    mine: sheetOf(me),
    theirs: sheetOf(them),
    myStrikes: strikesOf(me),
    theirStrikes: strikesOf(them),
  }
}

// ---------------------------------------------------------------------------
// The glass
// ---------------------------------------------------------------------------

interface Turned {
  startedAt: number
  /** Milliseconds already spent, from before the tab was hidden. */
  spent: number
}

/**
 * Three minutes, and it survives a refresh.
 *
 * Kept in this device's own storage rather than in the round, because when the
 * glass was turned is not a fact about the match — it is a fact about the
 * evening you happened to play it in, and she will turn her own hours later.
 *
 * **It pauses when the tab is hidden, and only in an asynchronous round.** A
 * phone call must not destroy a round nobody else is waiting on. In a live
 * round it cannot pause: the two of you are writing against the same three
 * minutes, and a timer one of you can stop is not a timer.
 */
function useGlass(storeKey: string, live: boolean) {
  const [turned, setTurned] = useState<Turned | null>(null)
  const [left, setLeft] = useState(GLASS_MS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      setTurned(raw ? (JSON.parse(raw) as Turned) : null)
    } catch {
      setTurned(null)
    }
  }, [storeKey])

  const write = useCallback(
    (next: Turned | null) => {
      setTurned(next)
      try {
        if (next) localStorage.setItem(storeKey, JSON.stringify(next))
        else localStorage.removeItem(storeKey)
      } catch {
        /* a browser with storage blocked still plays, it just forgets */
      }
    },
    [storeKey],
  )

  const turn = useCallback(() => write({ startedAt: Date.now(), spent: 0 }), [write])

  /*
    Counting down, off the clock rather than off a tick count — a tab that
    stalls for four seconds must lose four seconds, not one frame.

    **Once a second, not once a frame.** The first cut set state every frame,
    which re-rendered the twelve inputs, the notches and the whole sheet sixty
    times a second for five minutes — the exact thing the technical law is
    about, on the one screen in this game where somebody is typing. It buys
    nothing: the sand moves the height of the glass over five minutes, so a
    frame of it is a fifth of a pixel, and the only other reader is a clock
    that shows whole seconds. The frame loop stays, because it is what makes
    the arithmetic honest across a stall; only the *publishing* is throttled.
  */
  useEffect(() => {
    if (!turned) {
      setLeft(GLASS_MS)
      return
    }
    let raf = 0
    let shown = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const running = turned.startedAt === 0 ? 0 : Date.now() - turned.startedAt
      const ms = Math.max(0, GLASS_MS - turned.spent - running)
      const second = Math.ceil(ms / 1000)
      if (second === shown) return
      shown = second
      setLeft(ms)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [turned])

  useEffect(() => {
    if (!turned || live) return
    const onHide = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        if (turned.startedAt === 0) return
        write({ startedAt: 0, spent: turned.spent + (now - turned.startedAt) })
      } else if (turned.startedAt === 0) {
        write({ startedAt: now, spent: turned.spent })
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [turned, live, write])

  return { turned: turned !== null, left, turn, clear: () => write(null) }
}

// ---------------------------------------------------------------------------

export default function Scattergories({
  theirName,
  solo,
  variant,
  round,
  setup,
  mine,
  theirs,
  play,
  onLeave,
}: GameProps<ScatterSetup, ScatterMove>) {
  const data = useData()
  const live = variant === 'race'
  // The key as the door wrote it, which is not the same as `key` below.
  const liveKey = usePlaying((s) => s.race)
  /*
    Everything after the game's name, not the first piece of it.

    `split(':')[1]` is right for exactly one of the three ways in: a daily
    round is `scattergories:2026-08-29` and gives back the date. A live one is
    `scattergories:race:1787976619614` and gave back the word "race"; a solo
    one gave back "solo". Since this key is what `roundIdFor` builds the later
    rounds out of, every live match's round two was being written to the same
    document — `scattergories:race-r2` — and the second match you ever played
    would open the first one's second round. The same for every solo match.
    Round one was always fine, which is why it went unnoticed: it is the only
    round the shell opens by itself.
  */
  const key = round ? round.id.slice(GAME_ID.length + 1) : 'today'

  /**
   * Writing a move into one of the later round documents.
   *
   * The shell's `play` only knows about round one, because that is the only
   * round it opened. Everything after it goes through the seam directly — with
   * the same `attempt` wrapper every other write in the garden uses, because
   * nothing may fail quietly.
   */
  const send = useCallback(
    async (roundId: string, move: ScatterMove) => {
      await attempt('that didn’t save', () => data.playMove(roundId, move))
    },
    [data],
  )
  const match = useMemo(() => dealMatch(setup?.seed ?? 1), [setup?.seed])

  // Round one comes from the shell; the rest are opened as they are reached.
  const first = useMemo<RoundState>(() => {
    const sheetOf = (moves: ScatterMove[]) =>
      (moves.find((m) => m?.kind === 'sheet') as Sheet | undefined)?.answers ?? null
    const strikesOf = (moves: ScatterMove[]) =>
      (moves.find((m) => m?.kind === 'strike') as Strike | undefined)?.lines ?? []
    return {
      mine: sheetOf(mine),
      theirs: sheetOf(theirs),
      myStrikes: strikesOf(mine),
      theirStrikes: strikesOf(theirs),
    }
  }, [mine, theirs])

  /** Which rounds have been dismissed after their reveal. */
  const [movedOn, setMovedOn] = useState<number[]>([])

  // How far the match has got, which is how many documents need opening.
  const reached = Math.min(ROUNDS - 1, movedOn.length)
  const later = useMatch(key, reached)
  const rounds = useMemo(
    () => [first, ...later.slice(1)],
    [first, later],
  )

  const at = useMemo(() => {
    for (let n = 0; n < ROUNDS; n++) {
      const state = rounds[n] ?? empty
      if (!state.mine) return { n, phase: 'write' as const }
      if (!solo && !state.theirs) return { n, phase: 'wait' as const }
      if (!movedOn.includes(n)) return { n, phase: 'reveal' as const }
    }
    return { n: ROUNDS, phase: 'over' as const }
  }, [rounds, movedOn, solo])

  const deal = match[Math.min(at.n, ROUNDS - 1)]

  if (!setup) {
    return (
      <div className="game scatter">
        <p className="door-waiting">turning out the box…</p>
      </div>
    )
  }

  return (
    <div className="game scatter">
      {at.phase === 'write' && (
        <Writing
          key={at.n}
          deal={deal}
          round={at.n}
          storeKey={`garden:scatter:${key}:${at.n}`}
          live={live}
          theirName={theirName}
          /*
            A key per round, not per match.

            Every round turns its own glass, so every round needs its own
            flag — agreeing once at the start would leave the second round
            drifting apart again, and by then you are both mid-match and far
            less willing to notice.

            Built off `liveKey` — the key the door published — rather than off
            `key`, which has `race:` on the front of it. The two must agree,
            because this is what goes into `Presence.racing`, and she may be
            standing at the door reading it as somewhere to join.
          */
          lobbyKey={live && liveKey ? legKey(liveKey, at.n) : null}
          onDone={async (answers) => {
            const move: Sheet = { kind: 'sheet', round: at.n, answers }
            if (at.n === 0) await play(move)
            else await send(roundIdFor(key, at.n), move)
          }}
          onLeave={onLeave}
        />
      )}

      {at.phase === 'wait' && (
        <Waiting
          deal={deal}
          round={at.n}
          them={theirName}
          answers={rounds[at.n]?.mine ?? blank()}
          onLeave={onLeave}
        />
      )}

      {at.phase === 'reveal' && (
        <Reveal
          deal={deal}
          round={at.n}
          them={theirName}
          solo={solo}
          state={rounds[at.n] ?? empty}
          totals={totalsUpTo(match, rounds, at.n, solo)}
          onStrike={async (lines) => {
            const move: Strike = { kind: 'strike', round: at.n, lines }
            if (at.n === 0) await play(move)
            else await send(roundIdFor(key, at.n), move)
          }}
          onNext={() => setMovedOn((was) => [...was, at.n])}
          onLeave={onLeave}
        />
      )}

      {at.phase === 'over' && (
        <Over
          match={match}
          rounds={rounds}
          them={theirName}
          solo={solo}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function Writing({
  deal,
  round,
  storeKey,
  live,
  theirName,
  lobbyKey,
  onDone,
  onLeave,
}: {
  deal: Deal
  round: number
  storeKey: string
  live: boolean
  theirName: string
  /** The round's own key while rolling together, null when playing apart. */
  lobbyKey: string | null
  onDone(answers: string[]): Promise<void>
  onLeave(): void
}) {
  const glass = useGlass(storeKey + ':glass', live)

  /*
    Rolling together, actually together.

    "Roll together" used to mean nothing more than two people opening the same
    match: each of you then met your own `turn the glass` screen and started
    your own five minutes whenever you happened to press. Nobody lost time by
    it — the glass is per-device and you each got your full three — but the
    mode's whole promise is the same five minutes, and it was not keeping it.

    It mattered more than a broken promise, because `useGlass` gives up its
    pause for this. In an asynchronous round a phone call stops the clock; in a
    live one it cannot, on the grounds that a timer one of you can stop is not
    a timer. That reasoning only holds if the two clocks are the same clock.
    Until this room existed it took her safety away and gave nothing back.

    `flagAt` is latched: presence is cleared on the way out of the game, so
    reading `lobby.startAt` directly would make the flag un-drop underneath a
    round already being written.
  */
  const lobby = useLobby(lobbyKey)

  /*
    Up until the flag, not up until you agree on one.

    Leaving the room the moment both of you were ready meant the countdown —
    the one part of this that tells you it is about to start — was on screen
    for no frames at all. You went from "waiting" to a sheet of twelve blank
    categories with five minutes already running.
  */
  const waitingForHer = lobbyKey !== null && !lobby.go

  // The flag turns the glass. Both phones reach this line off the same number.
  useEffect(() => {
    if (!lobby.go || glass.turned) return
    glass.turn()
  }, [lobby.go, glass.turned, glass.turn])
  const [answers, setAnswers] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      const saved = raw ? (JSON.parse(raw) as string[]) : null
      return Array.isArray(saved) && saved.length === PER_SHEET ? saved : blank()
    } catch {
      return blank()
    }
  })
  const [sending, setSending] = useState(false)
  const [categoryAt, setCategoryAt] = useState(0)
  const fields = useRef<(HTMLInputElement | null)[]>([])
  const handed = useRef(false)

  /*
    The die tells you the letter. Nothing else is allowed to.

    The sentence underneath it used to be rendered at the same moment the die
    started tumbling, which gave the answer away before the throw had landed —
    the one thing a roll is for. It waits for the die now. Matched to the
    animation in `.die.rolling` rather than driven by it, because a callback
    out of a CSS keyframe is a listener and a race for something that is a
    fixed nine hundred milliseconds long.
  */
  const [landed, setLanded] = useState(false)
  const openingKeys = useMenuKeys(2, true, landed && !glass.turned && !waitingForHer)
  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 900)
    return () => window.clearTimeout(id)
  }, [])

  // Saved on every keystroke. A refresh mid-round must not cost the sheet —
  // it is five minutes of somebody's evening.
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(answers))
    } catch {
      /* storage blocked: the round still plays, it just cannot be resumed */
    }
  }, [storeKey, answers])

  const hand = useCallback(
    async (final: string[]) => {
      if (handed.current) return
      handed.current = true
      setSending(true)
      await onDone(final)
      glass.clear()
      try {
        localStorage.removeItem(storeKey)
      } catch {
        /* nothing to clean up */
      }
    },
    [onDone, glass, storeKey],
  )

  // The glass running out hands the sheet in as it stands. That is the game:
  // time is what stops you, not a button.
  useEffect(() => {
    if (glass.turned && glass.left <= 0) void hand(answers)
  }, [glass.turned, glass.left, answers, hand])

  const written = answers.filter((a) => a.trim() !== '').length

  useEffect(() => {
    if (!glass.turned) return
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = Math.max(
          0,
          Math.min(PER_SHEET - 1, categoryAt + (event.key === 'ArrowDown' ? 1 : -1)),
        )
        setCategoryAt(next)
        fields.current[next]?.focus()
      } else if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault()
        fields.current[categoryAt]?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [categoryAt, glass.turned])

  if (waitingForHer) {
    return (
      <div className="scatter-room">
        <p className="game-sub">
          round {round + 1} of {ROUNDS} · everything begins with <b>{deal.letter}</b>
        </p>
        <RaceRoom
          lobby={lobby}
          theirName={theirName}
          waitingFor={`${theirName} has the same letter and the same twelve. The glass turns for both of you at once.`}
          onLeave={onLeave}
          leaveLabel="not now"
        />
      </div>
    )
  }

  if (!glass.turned) {
    return (
      <>
        <div className="game-head">
          <p className="game-sub">round {round + 1} of {ROUNDS}</p>
          <Die letter={deal.letter} rolling />
          <div className={`scatter-landed ${landed ? 'shown' : ''}`}>
            <p className="game-ask">
              Everything begins with <b>{deal.letter}</b>.
            </p>
            <p className="game-sub">
              twelve of them, five minutes, and the glass only starts when you say
            </p>
          </div>
        </div>
        <div className="scatter-mid">
          <ol className={`scatter-peek ${landed ? 'shown' : ''}`}>
            {deal.categories.slice(0, 4).map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
            <li className="more">…and eight more</li>
          </ol>
        </div>
        <div className={`duel-actions scatter-landed ${landed ? 'shown' : ''}`}>
          <button
            ref={openingKeys.ref(0)}
            type="button"
            className={`put-back${openingKeys.selected === 0 ? ' is-selected' : ''}`}
            onFocus={() => openingKeys.choose(0)}
            onClick={glass.turn}
          >
            turn the glass
          </button>
          <button
            ref={openingKeys.ref(1)}
            type="button"
            className={`put-back quiet${openingKeys.selected === 1 ? ' is-selected' : ''}`}
            onFocus={() => openingKeys.choose(1)}
            onClick={onLeave}
          >
            not now
          </button>
        </div>
      </>
    )
  }

  const urgent = glass.left < 30_000

  return (
    <>
      <div className="game-head scatter-head">
        <Die letter={deal.letter} rolling={false} />
        <Glass left={glass.left / GLASS_MS} urgent={urgent} />
        <p className="scatter-left" role="timer" aria-live="off">
          {spoken(glass.left)}
        </p>
      </div>

      <ol className="scatter-sheet">
        {deal.categories.map((category, i) => (
          <li key={category.id} className={answers[i]?.trim() ? 'written' : ''}>
            <label>
              <span className="scatter-cat">{category.text}</span>
              <span className="scatter-write">
                <b aria-hidden="true">{deal.letter}</b>
                <input
                  ref={(node) => {
                    fields.current[i] = node
                  }}
                  className="ink"
                  value={answers[i] ?? ''}
                  enterKeyHint={i === PER_SHEET - 1 ? 'done' : 'next'}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={category.text}
                  onFocus={() => setCategoryAt(i)}
                  onChange={(e) => {
                    const next = [...answers]
                    next[i] = e.target.value
                    setAnswers(next)
                    ambience.nib(0.35 + Math.random() * 0.2)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      const next = Math.max(
                        0,
                        Math.min(PER_SHEET - 1, i + (e.key === 'ArrowDown' ? 1 : -1)),
                      )
                      setCategoryAt(next)
                      fields.current[next]?.focus()
                      return
                    }
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    // Enter saves and moves on, so a whole sheet can be filled
                    // without the keyboard ever going away.
                    const next = fields.current[i + 1]
                    if (next) next.focus()
                    else (e.target as HTMLInputElement).blur()
                  }}
                />
              </span>
            </label>
          </li>
        ))}
      </ol>

      <div className="scatter-foot">
        {/* Twelve notches: which are answered, and a way straight to one. */}
        <div className="scatter-notches" role="presentation">
          {deal.categories.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={answers[i]?.trim() ? 'on' : ''}
              aria-label={`category ${i + 1}`}
              onClick={() => fields.current[i]?.focus()}
            />
          ))}
        </div>
        <button
          type="button"
          className="put-back"
          disabled={sending}
          onClick={() => void hand(answers)}
        >
          {sending ? 'putting it under the cover…' : `hand it in · ${written}/${PER_SHEET}`}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function Waiting({
  deal,
  round,
  them,
  answers,
  onLeave,
}: {
  deal: Deal
  round: number
  them: string
  answers: string[]
  onLeave(): void
}) {
  const say = useSay()
  return (
    <>
      <div className="game-head">
        <p className="game-sub">round {round + 1} of {ROUNDS}</p>
        <h1 className="scatter-title">Yours is under the cover.</h1>
        <p className="game-ask">
          {them}&rsquo;s five minutes are {say('{hers}')} to turn. Neither list
          opens until both are in.
        </p>
      </div>
      <ol className="scatter-sheet sealed">
        {deal.categories.map((c, i) => (
          <li key={c.id}>
            <span className="scatter-cat">{c.text}</span>
            <span className="scatter-mine">{answers[i]?.trim() || '—'}</span>
          </li>
        ))}
      </ol>
      <div className="duel-actions">
        <button type="button" className="put-back" onClick={onLeave}>
          back to the fire
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// The reveal
// ---------------------------------------------------------------------------

function Reveal({
  deal,
  round,
  them,
  solo,
  state,
  totals,
  onStrike,
  onNext,
  onLeave,
}: {
  deal: Deal
  round: number
  them: string
  solo: boolean
  state: RoundState
  totals: { mine: number; theirs: number }
  onStrike(lines: number[]): Promise<void>
  onNext(): void
  onLeave(): void
}) {
  const [struck, setStruck] = useState<number[]>(state.myStrikes)
  const [asking, setAsking] = useState<number | null>(null)

  const myLines = useMemo(
    () => score(state.mine ?? blank(), state.theirs ?? [], deal.letter, state.theirStrikes),
    [state, deal.letter],
  )
  const herLines = useMemo(
    () => score(state.theirs ?? blank(), state.mine ?? [], deal.letter, struck),
    [state, deal.letter, struck],
  )

  const challenge = async (line: number) => {
    const next = struck.includes(line)
      ? struck.filter((n) => n !== line)
      : [...struck, line]
    setStruck(next)
    setAsking(null)
    await onStrike(next)
  }

  return (
    <>
      <div className="game-head">
        <p className="game-sub">
          round {round + 1} of {ROUNDS} · the letter was{' '}
          {/* The sub line is lower-cased, and a lower-case letter is the one
              thing on this screen that must not be. */}
          <span className="keep-case">{deal.letter}</span>
        </p>
        <p className="scatter-score">
          <b className="mine">{totals.mine + myLines.total}</b>
          <span>{solo ? '' : 'to'}</span>
          {!solo && <b className="hers">{totals.theirs + herLines.total}</b>}
        </p>
      </div>

      <ol className="scatter-reveal">
        {deal.categories.map((category, i) => (
          <li key={category.id}>
            <span className="scatter-cat">{category.text}</span>
            <Said
              className="mine"
              answer={state.mine?.[i] ?? ''}
              line={myLines.lines[i]}
              letter={deal.letter}
            />
            {!solo && (
              <Said
                className="hers"
                answer={state.theirs?.[i] ?? ''}
                line={herLines.lines[i]}
                letter={deal.letter}
                onChallenge={() => setAsking(asking === i ? null : i)}
                asking={asking === i}
                struck={struck.includes(i)}
              />
            )}
            {!solo && asking === i && (
              <Ask
                them={them}
                struck={struck.includes(i)}
                onDecide={() => void challenge(i)}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="duel-actions">
        <button type="button" className="put-back" onClick={onNext}>
          {round + 1 < ROUNDS ? 'the next letter' : 'how it finished'}
        </button>
        <button type="button" className="put-back quiet" onClick={onLeave}>
          back to the fire
        </button>
      </div>
    </>
  )
}

/**
 * One answer on the reveal, and what happened to it.
 *
 * The verdict is the class, so the burning-away of a matched pair and the
 * ignition of an alliterative one are CSS and not a timeline anybody has to
 * drive. A challenge is a long press, not a button: normal rounds must not
 * turn into administration, and the boxed game's challenge is rare too.
 */
function Said({
  className,
  answer,
  line,
  letter,
  onChallenge,
  asking,
  struck,
}: {
  className: string
  answer: string
  line: Line | undefined
  letter: string
  onChallenge?(): void
  asking?: boolean
  struck?: boolean
}) {
  const hold = useRef<number>(0)
  const verdict = line?.verdict ?? 'blank'

  const start = () => {
    if (!onChallenge) return
    hold.current = window.setTimeout(onChallenge, 480)
  }
  const stop = () => window.clearTimeout(hold.current)

  return (
    <span
      className={`scatter-said ${className} said-${verdict}${asking ? ' asked' : ''}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => {
        if (!onChallenge) return
        e.preventDefault()
        onChallenge()
      }}
    >
      <span className="scatter-word">{answer.trim() || '—'}</span>
      {line && line.points > 1 && (
        <b className="scatter-echo" aria-label={`${line.points} points`}>
          ×{line.points}
        </b>
      )}
      {struck && <b className="scatter-struck" aria-hidden="true">struck</b>}
      <i aria-hidden="true">{letter}</i>
    </span>
  )
}

/**
 * The question a long press asks, on its own line under the two answers.
 *
 * **It used to live inside her answer, and could not.** Absolutely positioned
 * in a grid cell about seven characters wide, it collapsed to that width and
 * was drawn straight over the next three categories — three lines of unreadable
 * text stacked on three other lines of readable ones. A thing that must be read
 * before it is answered cannot be laid out inside something narrower than it.
 *
 * So it is a row of the sheet instead, spanning all three columns, and the
 * lines below it move down. Only one is ever open, so what that costs is one
 * reflow of a list that is not moving.
 */
function Ask({
  them,
  struck,
  onDecide,
}: {
  them: string
  struck: boolean
  onDecide(): void
}) {
  return (
    <span className="scatter-challenge">
      <em>does that fit?</em>
      <button type="button" onClick={onDecide}>
        {struck ? 'fair enough' : 'it doesn’t fit'}
      </button>
      <small>{them} sees this. It counts for this round only.</small>
    </span>
  )
}

// ---------------------------------------------------------------------------

function totalsUpTo(
  match: Deal[],
  rounds: RoundState[],
  before: number,
  solo: boolean,
): { mine: number; theirs: number } {
  let mine = 0
  let theirs = 0
  for (let n = 0; n < before; n++) {
    const state = rounds[n]
    if (!state?.mine) continue
    mine += score(state.mine, state.theirs ?? [], match[n].letter, state.theirStrikes).total
    if (!solo && state.theirs) {
      theirs += score(state.theirs, state.mine, match[n].letter, state.myStrikes).total
    }
  }
  return { mine, theirs }
}

function Over({
  match,
  rounds,
  them,
  solo,
  onLeave,
}: {
  match: Deal[]
  rounds: RoundState[]
  them: string
  solo: boolean
  onLeave(): void
}) {
  const totals = totalsUpTo(match, rounds, ROUNDS, solo)
  const drawn = totals.mine === totals.theirs

  return (
    <>
      <div className="game-head">
        {/*
          Counted, never spelled out.

          This said "four rounds" twice in hardcoded words, so dropping the
          match to two left the ending screen confidently announcing a game
          nobody had played. The letters are already listed beside it, which is
          the honest version of the same fact — and `ROUNDS` can move again
          without leaving a lie behind.
        */}
        <p className="game-sub">
          {match.length} {match.length === 1 ? 'round' : 'rounds'} ·{' '}
          {match.map((r) => r.letter).join(' · ')}
        </p>
        <h1 className="scatter-title">
          {solo
            ? `${totals.mine} across ${match.length}.`
            : drawn
              ? 'Level, after all that.'
              : totals.mine > totals.theirs
                ? 'That one was yours.'
                : `${them} had it.`}
        </h1>
        <p className="scatter-score big">
          <b className="mine">{totals.mine}</b>
          {!solo && <span>to</span>}
          {!solo && <b className="hers">{totals.theirs}</b>}
        </p>
        <p className="game-ask">
          {/*
            The pollen is shared and the score is not kept. Two people, forever:
            a running tally of who wins is the one thing that could make being
            far apart feel worse, and it is not worth a number.
          */}
          The pollen is shared. Tomorrow the die is rolled again and none of
          this is remembered.
        </p>
      </div>
      <div className="scatter-mid" />
      <div className="duel-actions">
        <button type="button" className="put-back" onClick={onLeave}>
          back to the fire
        </button>
      </div>
    </>
  )
}
