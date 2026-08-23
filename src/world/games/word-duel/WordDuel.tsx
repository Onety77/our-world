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
 * catch the firelight or they don't.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
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

export default function WordDuel({
  theirName,
  solo,
  setup,
  mine,
  theirs,
  play,
  onLeave,
}: GameProps<DuelSetup, DuelMove>) {
  const [ready, setReady] = useState(wordsReady())
  const [typed, setTyped] = useState('')
  const [complaint, setComplaint] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

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
  const soloTarget = solo ? (lockedTarget ?? pileWord) : null

  const target = solo ? soloTarget : (lockedTarget ?? herWord)
  const done = target !== null && finished(myGuesses, target)
  const won = target !== null && solved(myGuesses, target)

  // Her board is scored against the word *I* gave her, which I know.
  const herDone = myWord !== null && finished(herGuesses, myWord)
  const herWon = myWord !== null && solved(herGuesses, myWord)
  const bothDone = done && herDone

  const tray = useMemo(
    () => (target ? letterState(myGuesses, target) : {}),
    [myGuesses, target],
  )

  const choosing = solo ? false : myWord === null
  const waiting = solo ? soloTarget === null : !choosing && target === null
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

  const type = useCallback((letter: string) => {
    setComplaint(null)
    setTyped((t) => (t.length >= LENGTH ? t : t + letter))
  }, [])

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

  const note = headline({ choosing, waiting, done, won, target, theirName, solo })

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
      <div className="game-head">{note && <p className="game-ask">{note}</p>}</div>

      <div className="duel-boards">
        {choosing ? (
          <div className="duel-choosing">
            <Word letters={typed.padEnd(LENGTH, ' ').split('')} marks={null} />
          </div>
        ) : (
          <>
            <Board guesses={myGuesses} answer={target} typed={done ? '' : typed} />
            {/* There is no second board on your own. Showing an empty one
                would be the game inventing an opponent it does not have. */}
            {!solo && (
              <TheirShape
                guesses={herGuesses}
                answer={myWord}
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
            (bothDone
              ? 'Yours was ' + (herWord ?? '').toUpperCase() +
                '. Hers was ' + (myWord ?? '').toUpperCase() + '.'
              : done
                ? 'You are done. ' + theirName + ' is still going.'
                : '')}
        </p>

        {typing && (
          <>
            <div className="tray">
              {ROWS.map((row) => (
                <div className="tray-row" key={row}>
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
                </div>
              ))}
            </div>
            <div className="duel-actions">
              <button
                type="button"
                className="put-back quiet"
                onClick={rub}
                disabled={sending || typed.length === 0}
              >
                rub out
              </button>
              <button
                type="button"
                className="put-back"
                onClick={commit}
                disabled={typed.length !== LENGTH || sending}
              >
                {choosing ? 'give her this one' : 'lay it down'}
              </button>
            </div>
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

/** Your board: one row per guess, then the one you are laying out. */
function Board({
  guesses,
  answer,
  typed,
}: {
  guesses: string[]
  answer: string | null
  typed: string
}) {
  const lines: { letters: string[]; marks: Mark[] | null }[] = guesses.map((g) => ({
    letters: g.split(''),
    marks: answer ? score(g, answer) : null,
  }))

  if (lines.length < TRIES) {
    lines.push({ letters: typed.padEnd(LENGTH, ' ').split(''), marks: null })
  }
  while (lines.length < TRIES) {
    lines.push({ letters: ' '.repeat(LENGTH).split(''), marks: null })
  }

  return (
    <div className="board">
      {lines.slice(0, TRIES).map((line, i) => (
        <Word key={i} letters={line.letters} marks={line.marks} />
      ))}
    </div>
  )
}

function Word({ letters, marks }: { letters: string[]; marks: Mark[] | null }) {
  return (
    <div className="word">
      {letters.map((letter, i) => (
        <Stone key={i} letter={letter} mark={marks?.[i] ?? null} index={i} />
      ))}
    </div>
  )
}

function Stone({
  letter,
  mark,
  index,
}: {
  letter: string
  mark: Mark | null
  index: number
}) {
  const shape = useMemo(() => pebble(letter + index), [letter, index])
  const blank = letter.trim() === ''
  return (
    <span className={'stone stone-' + (mark ?? (blank ? 'empty' : 'held'))} style={shape}>
      {letter.trim().toUpperCase()}
    </span>
  )
}

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
