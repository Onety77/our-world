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
import { usePaperDialog } from './usePaperDialog'
import { useBackCloses } from '@/systems/backstop'
import { findThoughts } from '@/systems/thoughts'

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
  const browsing = useReading(s => s.browsing)

  const letter = openId ? letters.find((l) => l.id === openId) : undefined
  const sheet = useRef<HTMLDivElement>(null)

  const [now, setNow] = useState(() => data.now())
  useEffect(() => {
    if (!openId) return
    setNow(data.now())
    const timer = setInterval(() => setNow(data.now()), 1000)
    return () => clearInterval(timer)
  }, [openId, data])
  const waiting = letter ? stillSealed(letter, me, now) : false
  const dialog = usePaperDialog(Boolean(letter), close)
  useBackCloses(Boolean(letter), close)
  const ordered = findThoughts(letters, me, now, 'all')
  const index = ordered.findIndex(item => item.id === openId)
  const go = (step: number) => {
    if (index < 0) return
    const next = ordered[index + step]
    if (next) useReading.getState().open(next.id)
  }

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
    void data.readSealedLetter(id).catch(() => null).then((body) => {
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
    if (!letter || letter.by === me || letter.readAt !== null || waiting || (needsWords && !already)) return
    const id = setTimeout(() => void attempt('the read mark did not reach the tree', () => data.markLetterRead(letter.id)), 700)
    return () => clearTimeout(id)
  }, [letter, data, waiting, needsWords, already, me])

  useEffect(() => {
    if (!letter) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, letters])
  useEffect(() => { sheet.current?.scrollTo({ top: 0 }) }, [openId])

  if (!letter) return null

  const author = profiles[letter.by]
  const mine = letter.by === me

  return (
    <div className="reader" ref={dialog} onClick={close} role="dialog" aria-modal="true" aria-label="Read a thought" tabIndex={-1}>
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
              // A refused or failed fetch is retryable; it is not proof that
              // the stored words are gone, and must not consume the read mark.
              <div className="ink sealed" role="status">
                <p>The words couldn’t be opened just now. The thought is still here.</p>
                <button type="button" onClick={() => setOpened(held => { const next = { ...held }; delete next[letter.id]; return next })}>try again</button>
              </div>
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

      <div className="tree-reader-actions" onClick={e => e.stopPropagation()}>
        {index >= 0 && <button type="button" className="put-back quiet" disabled={index === 0} onClick={() => go(-1)}>← newer</button>}
        <button type="button" className="put-back" onClick={close}>{browsing ? 'back to the thoughts' : 'put it back'}</button>
        {index >= 0 && <button type="button" className="put-back quiet" disabled={index === ordered.length - 1} onClick={() => go(1)}>older →</button>}
      </div>
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

  const draftKey = `tree-thought-draft:${data.me}`
  const [draft] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(draftKey) ?? '{}')
      return { body: typeof value.body === 'string' ? value.body.slice(0, 8000) : '', day: typeof value.day === 'string' ? value.day : '' }
    } catch { return { body: '', day: '' } }
  })
  const [body, setBody] = useState(draft.body)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [saveError, setSaveError] = useState('')
  const dialog = usePaperDialog(composing, () => { if (!pending.current) stopWriting() })
  useBackCloses(composing, () => {
    if (pending.current) return false
    stopWriting()
  })

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
  const [day, setDay] = useState(draft.day)
  const sealedFor = day === '' ? null : sealUntil(day)
  const field = useRef<HTMLTextAreaElement>(null)
  const [rising, setRising] = useState<string | null>(null)
  const risingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (risingTimer.current) clearTimeout(risingTimer.current) }, [])
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try {
      if (body || day) sessionStorage.setItem(draftKey, JSON.stringify({ body, day }))
      else sessionStorage.removeItem(draftKey)
    } catch { /* A private browser may refuse draft storage; the open sheet still keeps it. */ }
  }, [body, day, draftKey])

  // An untouched sheet is disposable. Once there are words on it, closing is
  // kept explicit so a stray tap cannot hide work in progress.
  useDismissOutside(composing && !saving && body.trim() === '', stopWriting, [sheet, actions])

  const them = profiles[data.me === 'warm' ? 'cool' : 'warm']

  useEffect(() => {
    if (composing) field.current?.focus()
  }, [composing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && composing && !pending.current) stopWriting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composing, stopWriting])

  async function plantIt() {
    const text = body.trim()
    if (text === '' || pending.current) return
    if (day && (sealedFor === null || sealedFor <= data.now())) {
      setSaveError('Choose a future day, or let this thought open now.')
      return
    }
    pending.current = true
    setSaving(true)
    setSaveError('')
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
    pending.current = false
    setSaving(false)
    if (!planted) { setSaveError('The thought has not been planted. Your words are still here; try again when you’re ready.'); return }
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
    if (risingTimer.current) clearTimeout(risingTimer.current)
    risingTimer.current = setTimeout(() => setRising(null), 2600)
  }

  if (rising && !composing) {
    return (
      <div className="rising">
        <span>{rising}</span>
      </div>
    )
  }

  if (!composing) return null

  return (
    <div className="reader composing" ref={dialog} role="dialog" aria-modal="true" aria-label="Plant a thought" aria-busy={saving} tabIndex={-1}>
      <div ref={sheet} className="sheet" role="presentation">
        <PaperGrain />
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">to {them.name}</p>
            <textarea
              ref={field}
              className="ink"
              value={body}
              aria-label="Your thought"
              maxLength={8000}
              disabled={saving}
              onChange={(e) => write(e.target.value)}
              placeholder="Something you noticed. Something you miss. Something you want them to know…"
              spellCheck
              rows={10}
            />
            <fieldset className="thought-seal-controls" disabled={saving}><Sealing day={day} setDay={setDay} them={them.name} /></fieldset>
            {body && <p className="thought-draft-note">Your draft stays in this tab until you plant it.{body.length > 7000 ? ` ${body.length} / 8000 characters.` : ''}</p>}
            {saveError && <p className="thought-save-error" role="alert">{saveError}</p>}
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
        <button
          type="button"
          className="put-back"
          onClick={() => void plantIt()}
          disabled={body.trim() === '' || saving}
        >
          {saving ? 'taking root…' : 'plant it'}
        </button>
        <button type="button" className="put-back quiet" disabled={saving} onClick={stopWriting}>
          {body.trim() ? 'keep for later' : 'not now'}
        </button>
      </div>
    </div>
  )
}
