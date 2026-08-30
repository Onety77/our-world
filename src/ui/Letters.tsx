/**
 * Reading a thought, and writing one.
 *
 * A thought you've opened is a sheet of paper filling the screen — aged, laid,
 * foxed at the corners, with the words in ink. Not text on a dim overlay: at
 * the Tree these are *things*, each one grew a flower, and something you pick
 * up should still look like an object while you're holding it.
 *
 * All the paper is drawn in CSS and one inline SVG filter. No image files, so
 * it costs nothing to load and stays sharp at any size.
 */

import { useEffect, useRef, useState } from 'react'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { useData, useWorldSlice } from '@/data/provider'
import { useReading } from '@/systems/reading'
import { thoughtSpot } from '@/sections/tree/layout'
import { useDismissOutside } from './useDismissOutside'

function when(at: number): string {
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * The grain. feTurbulence gives paper its blotchiness for a few hundred bytes,
 * where a photograph of paper would be half a megabyte and would tile visibly.
 */
function PaperGrain() {
  return (
    <svg className="paper-grain" aria-hidden="true">
      <filter id="paper-fibres">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.8"
          numOctaves="4"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#paper-fibres)" />
    </svg>
  )
}

/** The letter you've opened. */
export function LetterReader() {
  const data = useData()
  const me = data.me
  const letters = useWorldSlice((s) => s.letters)
  const profiles = useWorldSlice((s) => s.profiles)
  const openId = useReading((s) => s.openLetterId)
  const close = useReading((s) => s.close)

  const letter = openId ? letters.find((l) => l.id === openId) : undefined
  const sheet = useRef<HTMLDivElement>(null)

  // Opening it is what marks it read.
  useEffect(() => {
    if (!letter || letter.readAt !== null) return
    const id = setTimeout(() => void data.markLetterRead(letter.id), 700)
    return () => clearTimeout(id)
  }, [letter, data])

  useEffect(() => {
    if (!letter) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    // start at the top even if the last letter was scrolled
    sheet.current?.scrollTo({ top: 0 })
    return () => window.removeEventListener('keydown', onKey)
  }, [letter, close])

  if (!letter) return null

  const author = profiles[letter.by]
  const mine = letter.by === me

  return (
    <div className="reader" onClick={close} role="presentation">
      <div
        className="sheet"
        // clicking the paper itself shouldn't put it back
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <PaperGrain />
        <div className="sheet-scroll" ref={sheet}>
          <div className="sheet-body">
            <p className="ink">{letter.body}</p>
            <p className="signature">
              {mine ? 'you' : author.name}
              <span className="dated">{when(letter.at)}</span>
            </p>
          </div>
        </div>
      </div>

      <button type="button" className="put-back" onClick={close}>
        put it back
      </button>
    </div>
  )
}

/**
 * Writing a thought.
 *
 * Opened from the Tree, and it plants a flower. The only thing it needs from
 * the world is how many thoughts already exist, because that index is where
 * the new flower grows — see the spiral in sections/tree/layout.ts.
 */
export function Writing() {
  const data = useData()
  const letters = useWorldSlice((s) => s.letters)
  const profiles = useWorldSlice((s) => s.profiles)
  const composing = useReading((s) => s.composing)
  const stopWriting = useReading((s) => s.stopWriting)

  const [body, setBody] = useState('')

  /**
   * Every character puts a stroke of a pen on the paper.
   *
   * Driven off the value changing rather than off keydown, because keydown
   * never fires for a phone's autocorrect, misses composed input entirely, and
   * would put a scratch under the arrow keys. Comparing lengths also gets
   * backspace right — taking a character away is a duller, shorter sound —
   * and stops a paste turning into forty scratches at once.
   */
  const write = (next: string) => {
    const grew = next.length - body.length
    if (grew === 1) {
      // a wider letter takes a longer stroke than a full stop does
      const ch = next[next.length - 1] ?? ''
      const wide = /[a-z0-9]/i.test(ch) ? 0.55 : 0.25
      ambience.nib(wide + Math.random() * 0.25)
    } else if (grew > 1) {
      // pasted, or autocorrected a whole word in — one sound, not forty
      ambience.nib(0.9)
    } else if (grew < 0) {
      ambience.nib(0.4, true)
    }
    setBody(next)
  }
  const [rising, setRising] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)

  // An untouched sheet is disposable. Once there are words on it, closing is
  // kept explicit so a stray tap cannot hide work in progress.
  useDismissOutside(composing && body.trim() === '', stopWriting, [sheet, actions])

  const them = profiles[data.me === 'warm' ? 'cool' : 'warm']

  useEffect(() => {
    if (composing) field.current?.focus()
  }, [composing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && composing) stopWriting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composing, stopWriting])

  async function plantIt() {
    const text = body.trim()
    if (text === '') return
    const index = letters.filter((l) => l.placeId === 'tree').length
    const planted = await attempt('that thought didn’t take', () =>
      data.writeLetter({ body: text, placeId: 'tree', position: thoughtSpot(index) }),
    )
    // The words stay in the box if it failed. Clearing them first would mean a
    // bad connection quietly ate something somebody had just written.
    if (!planted) return
    ambience.cue('root', 0.85)
    setBody('')
    stopWriting()
    setRising('it took root')
    setTimeout(() => setRising(null), 2600)
  }

  if (rising) {
    return (
      <div className="rising">
        <span>{rising}</span>
      </div>
    )
  }

  if (!composing) return null

  return (
    <div className="reader composing">
      <div ref={sheet} className="sheet" role="presentation">
        <PaperGrain />
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">to {them.name}</p>
            <textarea
              ref={field}
              className="ink"
              value={body}
              onChange={(e) => write(e.target.value)}
              placeholder="&hellip;"
              spellCheck
              rows={10}
            />
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
        <button
          type="button"
          className="put-back"
          onClick={() => void plantIt()}
          disabled={body.trim() === ''}
        >
          plant it
        </button>
        <button type="button" className="put-back quiet" onClick={stopWriting}>
          not now
        </button>
      </div>
    </div>
  )
}
