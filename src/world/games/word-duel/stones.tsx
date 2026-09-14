/**
 * The board, the stones and the tray — the parts of the word game you touch.
 *
 * Out of `WordDuel` so that the two other places a word is laid down can use
 * the very same stones: the picker for a word you send as a link
 * (`WordPicker`), and the page that link opens for somebody who is not in the
 * garden at all (`src/word`). That page must not pull in the garden, so
 * nothing in here may import anything but React and `words`.
 *
 * The look is `stones.css`, which the garden's own stylesheet imports and the
 * public page imports on its own.
 */

import { useMemo, type CSSProperties } from 'react'
import { LENGTH, TRIES, score, type Mark } from './words'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

/** Which stone was just put down, and how many have been put down since. */
export interface Strike {
  at: number
  n: number
}

/** Your board: one row per guess, then the one you are laying out. */
export function Board({
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

export function Word({
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
 * The letters, with enter and rub-out on the bottom row.
 *
 * Enter and rub-out live *on the keyboard*, where a keyboard keeps them. They
 * used to be two buttons in a row underneath, and on a phone that is three
 * separate failures at once: below the tray so a thumb on the letters cannot
 * reach them, "lay it down" disabled until the fifth letter lands so it reads
 * as broken rather than as waiting, and no Enter key anywhere — the desktop
 * path was a `keydown` listener, which a phone has no way of firing.
 */
export function Tray({
  marks,
  onType,
  onEnter,
  onRub,
  canEnter,
  canRub,
  busy = false,
  enterLabel,
}: {
  /** The best thing known about each letter so far. */
  marks: Record<string, Mark>
  onType(letter: string): void
  onEnter(): void
  onRub(): void
  canEnter: boolean
  canRub: boolean
  busy?: boolean
  enterLabel: string
}) {
  return (
    <div className="tray">
      {ROWS.map((row, index) => (
        <div className="tray-row" key={row}>
          {index === 2 ? (
            <button
              type="button"
              className="tray-key tray-wide tray-enter"
              onClick={onEnter}
              disabled={!canEnter}
              aria-label={enterLabel}
            >
              enter
            </button>
          ) : null}
          {row.split('').map((letter) => (
            <button
              key={letter}
              type="button"
              className={'tray-key tray-' + (marks[letter] ?? 'fresh')}
              onClick={() => onType(letter)}
              disabled={busy}
            >
              {letter}
            </button>
          ))}
          {index === 2 ? (
            <button
              type="button"
              className="tray-key tray-wide tray-rub"
              onClick={onRub}
              disabled={!canRub}
              aria-label="rub out the last letter"
            >
              <span aria-hidden="true">⌫</span>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
