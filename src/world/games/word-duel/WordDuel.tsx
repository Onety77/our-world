/**
 * Word duel.
 *
 * You choose a five-letter word for her; she chooses one for you. Six guesses
 * each, scored the way everyone already knows. Neither word reaches the other
 * person until you have both chosen, so nobody's choice can be nudged.
 *
 * You do not see her letters — you see the *shape* of her board filling in,
 * the way a shared Wordle grid looks. That is deliberately all you get: her
 * letters would tell you nothing, since you picked her word and already know
 * the answer, and the shape is the part that is actually fun to watch.
 *
 * Nothing here is square. Every letter sits on a stone, and stones either
 * catch the firelight or they don't. Putting one down knocks it and throws a
 * few chips off the edge, with a small stone-on-stone tick — see
 * `ambience.chip`. Typing had no weight at all before that, which for a board
 * made of rocks is the one thing that gave it away.
 *
 * ---------------------------------------------------------------------------
 * **Three ways to play, and the third is the only live thing in the garden.**
 *
 *   vs her       you each choose a word for the other, a guess at a time,
 *                across days. The default, because seven timezones apart it is
 *                the one that actually gets used
 *   one player   the bag deals, and nobody is pretending to be an opponent
 *   time         *both of you, now.* The bag deals the same word to each of
 *                you and you have five minutes. First one there wins; if
 *                neither of you gets it you both lose, which is a better
 *                ending than a draw because it is funnier
 *
 * The race is only offered while you are both online — see `TimeChallenge` in
 * `ui/Threshold` for how two phones agree on which round they are in. Who won
 * is read off the **server timestamps on the moves**, never off either device's
 * clock, so both of you compute the same answer without having to agree.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ambience } from '@/systems/ambience'
import type { GameProps } from '../types'
import type { ChoseWord, DuelMove, DuelSetup } from './index'
import {
  LENGTH,
  TRIES,
  finished,
  fromThePile,
  isWord,
  letterState,
  loadWords,
  score,
  solved,
  wordsReady,
  type Mark,
} from './words'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

/** How long a time challenge lasts. */
const RACE_MS = 5 * 60 * 1000

export default function WordDuel({
  me,
  theirName,
  solo,
  variant,
  round,
  setup,
  mine,
  theirs,
  play,
  onLeave,
}: GameProps<DuelSetup, DuelMove>) {
  /*
    The time challenge.

    A different game played with the same board. Nobody chooses a word — the
    bag does, and it deals the *same* one to both of you — and you have five
    minutes to find it. First one there wins. If neither of you gets it, you
    both lose, which is a better ending than a draw because it is funnier.
  */
  const race = variant === 'race'
  const [ready, setReady] = useState(wordsReady())
  const [typed, setTyped] = useState('')
  const [complaint, setComplaint] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  /** Which stone was just struck, and a counter so the same one can restart. */
  const [strike, setStrike] = useState({ at: -1, n: 0 })

  useEffect(() => {
    if (ready) return
    let live = true
    void loadWords().then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [ready])

  // ---- what has happened so far -------------------------------------------

  const isWordMove = (m: DuelMove): m is ChoseWord => m.kind === 'word'

  const myWord = useMemo(() => mine.find(isWordMove)?.word ?? null, [mine])
  const herWord = useMemo(() => theirs.find(isWordMove)?.word ?? null, [theirs])

  const myGuesses = useMemo(
    () =>
      mine
        .filter((m) => m.kind === 'guess')
        .map((m) => (m as { guess: string }).guess)
        .filter((g) => g.length === LENGTH),
    [mine],
  )
  const herGuesses = useMemo(
    () =>
      theirs
        .filter((m) => m.kind === 'guess')
        .map((m) => (m as { guess: string }).guess)
        .filter((g) => g.length === LENGTH),
    [theirs],
  )

  /**
   * What I am playing against. Fixed by my first guess-move, so that her word
   * arriving late cannot swap the answer out from under a board I have already
   * started.
   */
  const lockedTarget = useMemo(() => {
    const first = mine.find((m) => m.kind === 'guess') as { target?: string } | undefined
    return first?.target ?? null
  }, [mine])

  const pileWord = useMemo(
    () => (ready && setup ? fromThePile(setup.seed) : null),
    [ready, setup],
  )

  /*
    On your own, there is nobody to choose a word *for*.

    So the round skips straight past the giving step and takes its word out of
    the bag, which is the same bag the two-player round falls back to when she
    has not left you one. The computer is not playing against you and this is
    careful not to pretend it is — it deals a word, and that is all.
  */


  /*
    In a race the bag deals, exactly as it does on your own — the difference is
    that it deals the same word to both of you, because the round id is the
    same and the word comes from the round id.
  */
  const dealt = solo || race ? (lockedTarget ?? pileWord) : null
  const target = solo || race ? dealt : (lockedTarget ?? herWord)

  // ---- the clock -----------------------------------------------------------
  /*
    Ticked once a second, and only while a race is actually running.

    The deadline comes off the *round's* `startedAt`, which is the server's
    clock and therefore the same number on both phones. The countdown itself is
    drawn from the local clock, so a few seconds of skew would show — but who
    won is never decided from this. That is decided from the timestamps on the
    moves themselves, which are also the server's. The clock on the wall is for
    the player; the result is from the record.
  */
  const [now, setNow] = useState(() => Date.now())
  const deadline = race && round ? round.startedAt + RACE_MS : 0
  const left = deadline ? Math.max(0, deadline - now) : 0
  const outOfTime = race && deadline > 0 && left <= 0

  useEffect(() => {
    if (!race || !deadline) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [race, deadline])

  const done =
    target !== null && (finished(myGuesses, target) || (race && outOfTime))
  const won = target !== null && solved(myGuesses, target)

  /*
    Her board.

    In the ordinary duel she is solving the word *I* gave her, which I know, so
    her shape can be scored here. In a race she is solving the same word I am.
    Either way the letters are never shown — only the shape.
  */
  const herAnswer = race ? target : myWord
  const herDone =
    herAnswer !== null && (finished(herGuesses, herAnswer) || (race && outOfTime))
  const herWon = herAnswer !== null && solved(herGuesses, herAnswer)
  const bothDone = done && herDone

  /*
    Who got there first, from the record rather than from the boards.

    Both of you read the same moves with the same server timestamps on them, so
    both devices reach the same answer without having to agree about anything.
  */
  const finishedAt = useMemo(() => {
    if (!race || !round || !target) return { mine: null, theirs: null }
    let ours: number | null = null
    let hers: number | null = null
    for (const move of round.moves) {
      const data = move.data as DuelMove | undefined
      if (!data || data.kind !== 'guess' || data.guess !== target) continue
      if (move.by === me) ours ??= move.at
      else hers ??= move.at
    }
    return { mine: ours, theirs: hers }
  }, [race, round, target, me])

  const tray = useMemo(
    () => (target ? letterState(myGuesses, target) : {}),
    [myGuesses, target],
  )

  // Nobody chooses a word in a race, so there is no giving step at all.
  const choosing = solo || race ? false : myWord === null
  const waiting = solo || race ? dealt === null : !choosing && target === null
  const typing = choosing || (!waiting && !done)

  // ---- doing things --------------------------------------------------------

  const send = useCallback(
    async (move: DuelMove) => {
      setSending(true)
      try {
        await play(move)
        setTyped('')
        setComplaint(null)
      } finally {
        setSending(false)
      }
    },
    [play],
  )

  const commit = useCallback(() => {
    const word = typed.toLowerCase()
    if (word.length !== LENGTH || sending) return

    if (!isWord(word)) {
      setComplaint('That one is not in the book.')
      return
    }

    if (choosing) {
      void send({ kind: 'word', word })
      return
    }
    if (!target) return
    if (myGuesses.includes(word)) {
      setComplaint('You have already tried that one.')
      return
    }
    void send(
      myGuesses.length === 0
        ? { kind: 'guess', guess: word, target }
        : { kind: 'guess', guess: word },
    )
  }, [typed, sending, choosing, target, myGuesses, send])

  /*
    Putting a letter down.

    `typed` is read here rather than in a `setState` updater, because the
    strike and the sound are side effects and side effects must not go inside
    an updater — React may run one more than once, and during render. The
    counter is what makes the animation restart: same stone, same letter, but a
    new `key`, so the chips are thrown again instead of the browser deciding
    nothing has changed.
  */
  const type = useCallback(
    (letter: string) => {
      if (typed.length >= LENGTH) return
      setComplaint(null)
      setTyped(typed + letter)
      setStrike((s) => ({ at: typed.length, n: s.n + 1 }))
      // The last stone of a word lands a little heavier than the first.
      ambience.chip(0.35 + (typed.length / (LENGTH - 1)) * 0.5)
    },
    [typed],
  )

  const rub = useCallback(() => {
    setComplaint(null)
    setTyped((t) => t.slice(0, -1))
  }, [])

  // A real keyboard works too. Most of the time this is played on a phone, but
  // not always, and nothing is more annoying than a word game you cannot type
  // into.
  useEffect(() => {
    if (!typing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        commit()
        return
      }
      if (e.key === 'Backspace') {
        rub()
        return
      }
      const k = e.key.toLowerCase()
      if (/^[a-z]$/.test(k)) type(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [typing, commit, rub, type])

  if (!ready || !setup) {
    return (
      <div className="game duel">
        <p className="door-waiting">turning out the word bag...</p>
      </div>
    )
  }

  const note = race
    ? raceHeadline({ done, won, herWon, outOfTime, finishedAt, target, theirName })
    : headline({ choosing, waiting, done, won, target, theirName, solo })

  return (
    <div className="game duel">
      {/*
        A line only when there is something the board cannot show.

        While you are guessing there is nothing to say: six rows *is* six goes,
        and telling somebody how the game they are playing works is noise laid
        over the thing they came for. What is left are the three moments the
        board genuinely cannot express on its own — that you are choosing a
        word rather than guessing one, that there is nothing to guess yet, and
        how it ended.
      */}
      {/*
        The wrapper stays even when there is nothing to say.

        `.game` is a three-row grid — head, boards, foot — and dropping the
        first child outright handed the boards the header's row and the foot
        the stretchy one, which shoved the whole board up off the top of the
        screen. Empty, this collapses to no height and the boards centre in
        what is left, which is what was wanted.
      */}
      <div className="game-head">
        {/*
          The clock, and it is the only number this game has ever shown.

          It earns its place because a time challenge without a visible clock is
          just a duel you feel vaguely anxious during — the whole shape of the
          thing is "how long have I got", and that is not a question the board
          can answer. It goes urgent under the last minute and stops at zero.
        */}
        {race && !outOfTime && (
          <p className={'race-clock' + (left < 60_000 ? ' close' : '')}>
            {clockFace(left)}
          </p>
        )}
        {note && <p className="game-ask">{note}</p>}
      </div>

      <div className="duel-boards">
        {choosing ? (
          <div className="duel-choosing">
            <Word letters={typed.padEnd(LENGTH, ' ').split('')} marks={null} strike={strike} />
          </div>
        ) : (
          <>
            <Board guesses={myGuesses} answer={target} typed={done ? '' : typed} strike={strike} />
            {/* There is no second board on your own. Showing an empty one
                would be the game inventing an opponent it does not have. */}
            {!solo && (
              <TheirShape
                guesses={herGuesses}
                answer={herAnswer}
                done={herDone}
                won={herWon}
              />
            )}
          </>
        )}
      </div>

      <div className="duel-foot">
        <p className="duel-say" role="status" aria-live="polite">
          {complaint ??
            (race
              ? /* The word is shared, so there are no two words to reveal — and
                   the result line above has already said who got there. All
                   that is left is the honest state of the other board. */
                done && !herDone
                ? theirName + ' is still looking.'
                : ''
              : bothDone
                ? 'Yours was ' + (herWord ?? '').toUpperCase() +
                  '. Hers was ' + (myWord ?? '').toUpperCase() + '.'
                : done
                  ? 'You are done. ' + theirName + ' is still going.'
                  : '')}
        </p>

        {typing && (
          <>
            {/*
              Enter and rub-out live *on the keyboard*, where a keyboard keeps
              them.

              They used to be two buttons in a row underneath, and on a phone
              that is three separate failures at once: they are below the tray
              so a thumb on the letters cannot reach them, "lay it down" is
              disabled until the fifth letter lands so it reads as broken
              rather than as waiting, and there is no Enter key anywhere — the
              desktop path was a `keydown` listener, which a phone has no way
              of firing. So the game could be typed into and not submitted.

              On the bottom row with the letters, as every word game on a phone
              has them, and wide enough to be hit without aiming.
            */}
            <div className="tray">
              {ROWS.map((row, index) => (
                <div className="tray-row" key={row}>
                  {index === 2 ? (
                    <button
                      type="button"
                      className="tray-key tray-wide tray-enter"
                      onClick={commit}
                      disabled={typed.length !== LENGTH || sending}
                      aria-label={choosing ? 'give her this word' : 'lay this word down'}
                    >
                      enter
                    </button>
                  ) : null}
                  {row.split('').map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      className={'tray-key tray-' + (tray[letter] ?? 'fresh')}
                      onClick={() => type(letter)}
                      disabled={sending}
                    >
                      {letter}
                    </button>
                  ))}
                  {index === 2 ? (
                    <button
                      type="button"
                      className="tray-key tray-wide tray-rub"
                      onClick={rub}
                      disabled={sending || typed.length === 0}
                      aria-label="rub out the last letter"
                    >
                      <span aria-hidden="true">⌫</span>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {/*
              What enter will do, in words, because the key itself cannot say
              it. Choosing a word for her and guessing hers are different acts
              and the board looks identical for both.
            */}
            <p className="duel-enter-says">
              {typed.length !== LENGTH
                ? `${LENGTH - typed.length} more`
                : choosing
                  ? 'enter gives her this one'
                  : 'enter lays it down'}
            </p>
          </>
        )}

        {waiting && (
          <div className="duel-actions">
            <button
              type="button"
              className="put-back"
              onClick={() =>
                pileWord && void send({ kind: 'guess', guess: '', target: pileWord })
              }
              disabled={sending || !pileWord}
            >
              take one from the pile
            </button>
            <button type="button" className="put-back quiet" onClick={onLeave}>
              wait for her
            </button>
          </div>
        )}

        {!typing && !waiting && (
          <div className="duel-actions">
            <button type="button" className="put-back quiet" onClick={onLeave}>
              back out to the fire
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What, if anything, needs saying.
 *
 * `null` while you are simply playing — which is most of the time, and is the
 * point. Every string here is a fact you cannot get off the board by looking
 * at it.
 */
function headline({
  choosing,
  waiting,
  done,
  won,
  target,
  theirName,
  solo,
}: {
  choosing: boolean
  waiting: boolean
  done: boolean
  won: boolean
  target: string | null
  theirName: string
  solo: boolean
}): string | null {
  if (choosing) return 'A word for ' + theirName
  if (waiting) {
    return solo ? 'Turning out the bag' : theirName + ' has not left you one yet'
  }
  if (done && won) return 'Got it.'
  if (done) return 'It was ' + (target ?? '').toUpperCase() + '.'
  return null
}

/**
 * How a race ended, in one line.
 *
 * The only rule worth stating: **both of you can lose.** A draw would be the
 * tidy outcome and it is the wrong one — five minutes of nobody getting it is
 * funnier as a shared failure than as an honourable tie, and this is a game
 * for two people who will be teasing each other about it afterwards.
 */
function raceHeadline({
  done,
  won,
  herWon,
  outOfTime,
  finishedAt,
  target,
  theirName,
}: {
  done: boolean
  won: boolean
  herWon: boolean
  outOfTime: boolean
  finishedAt: { mine: number | null; theirs: number | null }
  target: string | null
  theirName: string
}): string | null {
  const answer = (target ?? '').toUpperCase()

  // Somebody has it. Whoever's stamp is earlier took it.
  if (finishedAt.mine !== null && finishedAt.theirs !== null) {
    return finishedAt.mine <= finishedAt.theirs
      ? 'You got there first.'
      : theirName + ' got there first.'
  }
  if (won && !herWon) return outOfTime || done ? 'You got it. ' + theirName + ' did not.' : 'Got it — and she has not.'
  if (herWon && !won) return theirName + ' got it. It was ' + answer + '.'

  if (outOfTime) return 'Neither of you. It was ' + answer + '.'
  if (done && !won) return 'Out of guesses. It was ' + answer + '.'
  return null
}

/** Which stone was just put down, and how many have been put down since. */
export interface Strike {
  at: number
  n: number
}

/** Your board: one row per guess, then the one you are laying out. */
function Board({
  guesses,
  answer,
  typed,
  strike,
}: {
  guesses: string[]
  answer: string | null
  typed: string
  strike: Strike
}) {
  const lines: { letters: string[]; marks: Mark[] | null }[] = guesses.map((g) => ({
    letters: g.split(''),
    marks: answer ? score(g, answer) : null,
  }))

  // Only the row being laid out can be struck; the ones already down are done.
  const live = lines.length
  if (lines.length < TRIES) {
    lines.push({ letters: typed.padEnd(LENGTH, ' ').split(''), marks: null })
  }
  while (lines.length < TRIES) {
    lines.push({ letters: ' '.repeat(LENGTH).split(''), marks: null })
  }

  return (
    <div className="board">
      {lines.slice(0, TRIES).map((line, i) => (
        <Word
          key={i}
          letters={line.letters}
          marks={line.marks}
          strike={i === live ? strike : null}
        />
      ))}
    </div>
  )
}

function Word({
  letters,
  marks,
  strike,
}: {
  letters: string[]
  marks: Mark[] | null
  strike?: Strike | null
}) {
  return (
    <div className="word">
      {letters.map((letter, i) => (
        <Stone
          key={i}
          letter={letter}
          mark={marks?.[i] ?? null}
          index={i}
          struck={strike && strike.at === i ? strike.n : 0}
        />
      ))}
    </div>
  )
}

function Stone({
  letter,
  mark,
  index,
  struck,
}: {
  letter: string
  mark: Mark | null
  index: number
  struck: number
}) {
  const shape = useMemo(() => pebble(letter + index), [letter, index])
  const blank = letter.trim() === ''
  return (
    <span
      className={
        'stone stone-' + (mark ?? (blank ? 'empty' : 'held')) + (struck ? ' struck' : '')
      }
      style={shape}
    >
      {letter.trim().toUpperCase()}
      {/*
        Chips off the stone.

        Keyed on the strike counter so the same stone can be hit again and
        again — React would otherwise see an identical element and leave the
        finished animation exactly where it was, which after the first letter
        is no animation at all. Remounting restarts it.

        Six of them, thrown at fixed angles that are jittered per stone rather
        than per strike, so a given pebble always breaks the same way. Pure
        decoration: `aria-hidden`, and nothing below can be clicked through it.
      */}
      {struck > 0 && (
        <b key={struck} className="chips" aria-hidden="true">
          {CHIP_ANGLES.map((angle, i) => (
            <i key={i} style={{ '--a': angle + 'deg' } as CSSProperties} />
          ))}
        </b>
      )}
    </span>
  )
}

/** Where the chips go. Six is enough to read as a burst and cheap to draw. */
const CHIP_ANGLES = [-118, -64, -22, 26, 68, 124]

/**
 * The shape of one stone.
 *
 * Eight percentages turn a div into an irregular pebble, and taking them from
 * the letter and its position means a given stone keeps its shape instead of
 * squirming every time the component re-renders — which is on every keystroke.
 */
function pebble(key: string): CSSProperties {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const p = (shift: number, low: number, span: number) =>
    low + (((h >>> shift) % 100) / 100) * span

  // A wide spread on purpose. Keeping every corner near 50% produces a circle,
  // which reads as a coin or a bead; real pebbles are lopsided, and it takes a
  // range this broad before the eye stops seeing a repeated shape.
  const radii =
    p(2, 32, 36).toFixed(0) + '% ' +
    p(5, 32, 36).toFixed(0) + '% ' +
    p(8, 32, 36).toFixed(0) + '% ' +
    p(11, 32, 36).toFixed(0) + '% / ' +
    p(14, 34, 32).toFixed(0) + '% ' +
    p(17, 34, 32).toFixed(0) + '% ' +
    p(20, 34, 32).toFixed(0) + '% ' +
    p(23, 34, 32).toFixed(0) + '%'

  return {
    borderRadius: radii,
    transform: 'rotate(' + p(26, -7, 14).toFixed(2) + 'deg)',
  }
}

/**
 * Her board, as shape only.
 *
 * Exactly the grid everyone shares after a Wordle, except live. Her letters are
 * deliberately absent: you chose her word, so they would tell you nothing, and
 * watching the pattern arrive is the part worth watching.
 */
function TheirShape({
  guesses,
  answer,
  done,
  won,
}: {
  guesses: string[]
  answer: string | null
  done: boolean
  won: boolean
}) {
  return (
    <div className={done ? 'shape shape-done' : 'shape'}>
      <div className="shape-grid">
        {Array.from({ length: TRIES }, (_, row) => {
          const guess = guesses[row]
          const marks = guess && answer ? score(guess, answer) : null
          return (
            <div className="shape-row" key={row}>
              {Array.from({ length: LENGTH }, (_, i) => (
                <span key={i} className={'pip pip-' + (marks?.[i] ?? 'empty')} />
              ))}
            </div>
          )
        })}
      </div>
      <span className="shape-note">
        {done
          ? won
            ? 'got it in ' + guesses.length
            : 'did not get it'
          : guesses.length + ' so far'}
      </span>
    </div>
  )
}

/** 4:07 — minutes and seconds, always two digits of seconds. */
function clockFace(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
