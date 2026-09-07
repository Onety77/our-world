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
import { sealUntil, stillSealed } from '@/data/types'
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
 * The day a sealed thought opens.
 *
 * Always with the year, unlike `when` above, and that is not an oversight: a
 * date in the past can safely leave the year off because "3 June" obviously
 * means the last one. A date ahead cannot — "3 June" is next year as easily as
 * this one, and the whole value of the line is knowing how long the wait is.
 */
function whenItOpens(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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

  const waiting = letter ? stillSealed(letter, me, Date.now()) : false

  /*
    The words of a sealed thought, fetched when the paper is opened.

    Not with the rest of the tree: a sealed thought is one document more than
    an ordinary one, and paying for that on every load — to show words nobody
    has asked to read — is the wrong way round. Kept for the session once it
    has come back, because a revealed thought can never change again: the rules
    refuse every update to it.

    `null` is the honest answer to asking early and is never reported as a
    failure. It is the seal holding.
  */
  const [opened, setOpened] = useState<Record<string, string | null>>({})
  const needsWords = Boolean(letter && letter.openAt !== null && letter.body === '' && !waiting)
  const already = letter ? opened[letter.id] : undefined

  useEffect(() => {
    if (!letter || !needsWords || already !== undefined) return
    let dropped = false
    const id = letter.id
    /*
      `null` is recorded rather than discarded, so that "not answered yet" and
      "answered, and there was nothing there" stay different things. They render
      differently below, and discarding this left the second one showing the
      first one's ellipsis forever.
    */
    void data.readSealedLetter(id).then((body) => {
      if (dropped) return
      setOpened((held) => ({ ...held, [id]: body }))
    })
    return () => {
      dropped = true
    }
  }, [letter, needsWords, already, data])

  /*
    Opening it is what marks it read — but a thought you cannot read yet has
    not been read. Marking it now would spend the one moment its flower is lit
    on a paper that said nothing, and `readAt` can never be set twice.
  */
  useEffect(() => {
    if (!letter || letter.readAt !== null || waiting) return
    const id = setTimeout(() => void data.markLetterRead(letter.id), 700)
    return () => clearTimeout(id)
  }, [letter, data, waiting])

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
            {/*
              Three states, and the middle one is the point.

              A thought still waiting says the day and nothing else — not a
              greyed-out shape of the words, not a placeholder the length of
              them. There is nothing to redact here because the words are not
              on this device: the server refused them. The paper says the true
              thing, which is that there is something here and it is not time.
            */}
            {waiting ? (
              <p className="ink sealed">
                <span>{author.name} left this for </span>
                <em>{whenItOpens(letter.openAt ?? 0)}</em>
                <span>. it is not open yet.</span>
              </p>
            ) : needsWords && already === null ? (
              /*
                The day has come, the words were asked for, and nothing came
                back. Rare, and it should now be impossible to create — the two
                documents are written in one batch — but a thought sealed before
                that was true could have landed without its words, and they
                cannot be written again: the rules refuse every update.

                An ellipsis here would say "still coming", which is the one
                thing that is certainly false.
              */
              <p className="ink sealed">
                <span>{author.name} sealed this for today, but the words did not </span>
                <span>arrive with it. they cannot be recovered.</span>
              </p>
            ) : (
              <p className="ink">{letter.body || already || '…'}</p>
            )}
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

/** Tomorrow, as `YYYY-MM-DD` — the earliest a thought can be sealed for. */
function earliest(): string {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** A day, in the words this world uses for days. */
function theDay(day: string): string {
  const at = sealUntil(day)
  if (at === null) return day
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * When it opens — the one line on the paper that is not the thought itself.
 *
 * ---------------------------------------------------------------------------
 * **A thought can be left for a day rather than for now.** A birthday, an
 * anniversary, the morning she lands. The words go somewhere the rules refuse
 * until then, so this is not a promise the interface is keeping — see
 * `firestore.rules` under `letters/{id}/sealed/words`.
 *
 * **It is a written line, not a form.** The default is nothing at all: an
 * empty date and the word *now*, which is what every thought in this garden
 * has always been, and the sheet reads exactly as it did before this existed.
 * The `Memory.when` field next door refuses a date picker outright, and is
 * right to — a picker insists on a precision nobody has about *when a
 * photograph was taken*. This is the opposite case and the only one in the
 * world that needs a real day: a seal has to know, to the day, when to open,
 * and there is no honest way to guess it from words.
 *
 * The native field is deliberately not dressed up as something else. It is the
 * one control in this garden that opens the phone's own calendar, because the
 * phone's calendar is better at this than anything that could be drawn here,
 * and it appears only after somebody has asked for a day.
 * ---------------------------------------------------------------------------
 */
function Sealing({
  day,
  setDay,
  them,
}: {
  day: string
  setDay: (day: string) => void
  them: string
}) {
  const [asking, setAsking] = useState(false)
  const sealed = day !== ''

  return (
    <div className="sealing">
      {/*
        Two lines rather than one with a separator between them.

        The first says what will happen; the second is the way to change it.
        They were one line joined by a "·" and at 390 wide it wrapped every
        time — leaving the separator hanging alone at the end of the first
        line, pointing at nothing. Two sentences wrap on their own terms.
      */}
      {sealed ? (
        <>
          <p>
            <span>{them} finds this on </span>
            <button type="button" className="chosen" onClick={() => setAsking(true)}>
              {theDay(day)}
            </button>
          </p>
          <p>
            <button
              type="button"
              onClick={() => {
                setDay('')
                setAsking(false)
              }}
            >
              not yet — let it open now
            </button>
          </p>
        </>
      ) : (
        <>
          <p>{them} finds this as soon as it takes root</p>
          <p>
            <button type="button" onClick={() => setAsking(true)}>
              or keep it for a day
            </button>
          </p>
        </>
      )}

      {asking ? (
        <input
          type="date"
          className="sealing-day"
          value={day}
          min={earliest()}
          aria-label="the day this thought opens"
          autoFocus
          onChange={(event) => {
            setDay(event.target.value)
            if (event.target.value !== '') setAsking(false)
          }}
        />
      ) : null}
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
  /*
    When it opens, as `YYYY-MM-DD`, or '' for now.

    One piece of state and not two. A separate "is it sealed" flag would be a
    second source of truth for the same fact, and the two of them would
    disagree the first time somebody chose a day and then chose *now* again —
    which is exactly the sort of disagreement that ends with a thought sealed
    for a date nobody picked.
  */
  const [day, setDay] = useState('')
  const sealedFor = day === '' ? null : sealUntil(day)
  const field = useRef<HTMLTextAreaElement>(null)
  const [rising, setRising] = useState<string | null>(null)
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
      data.writeLetter({
        body: text,
        placeId: 'tree',
        position: thoughtSpot(index),
        openAt: sealedFor,
      }),
    )
    // The words stay in the box if it failed. Clearing them first would mean a
    // bad connection quietly ate something somebody had just written.
    if (!planted) return
    ambience.cue('root', 0.85)
    setBody('')
    setDay('')
    stopWriting()
    /*
      A sealed thought says something different on the way down, because it did
      something different: it did not arrive, it started waiting. The words are
      the only thing that tells you, so they have to be the true ones.
    */
    setRising(sealedFor === null ? 'it took root' : 'it will keep until then')
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
            <Sealing day={day} setDay={setDay} them={them.name} />
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
