/**
 * The words over the hill.
 *
 * ---------------------------------------------------------------------------
 * **Nothing here draws a card, a panel or a backdrop, and the reason is not
 * only the design law.** The whole point of a session in this place is that the
 * mist is pulling back *behind* the word you are reading — so anything that
 * covered the world would cover the only feedback the section has. The word
 * sits on the hillside with a lift shadow, the way the name of every place
 * does, and you watch the fold open behind it.
 *
 * The one thing that does cover the world is a form, because writing needs
 * somewhere to write, and those are already the garden's exception.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '@/data/provider'
import { CREATURE_KINDS, type CreatureKind, type PracticeKind, type PracticeOwner } from '@/data/types'
import { ambience } from '@/systems/ambience'
import { conditionOf, keptRecently, keptToday, metCount } from '@/systems/fold'
import { todoFor, useTending } from '@/systems/tending'
import { localDateKey } from '@/systems/time'
import { attempt } from '@/systems/trouble'
import { useMenuKeys } from './useMenuKeys'
import './Fold.css'

/** Today, in this person's own timezone. See the note in `Fold.tsx` (scene). */
function useToday(): string {
  const data = useData()
  const zone = data.snapshot().profiles[data.me].timeZone
  const [key, setKey] = useState(() => localDateKey(zone))
  useEffect(() => {
    /*
      Re-read on a timer, because a session can be open across midnight and a
      day key captured on mount would quietly mark tomorrow's practice against
      yesterday. Half-hourly is plenty for a boundary that moves once a day.
    */
    const id = setInterval(() => setKey(localDateKey(zone)), 1_800_000)
    return () => clearInterval(id)
  }, [zone])
  return key
}

/* -------------------------------------------------------------------------- */
/* the way in                                                                  */
/* -------------------------------------------------------------------------- */

export function FoldThreshold() {
  const data = useData()
  const me = data.me
  const today = useToday()
  const practices = useTending((s) => s.practices)
  const words = useTending((s) => s.words)
  const loaded = useTending((s) => s.loaded)
  const begin = useTending((s) => s.begin)
  /*
    The forms are opened from here and *rendered* by `FoldSitting`, at the top
    level. A `position: fixed` sheet nested inside this component would resolve
    against the threshold's own transformed box rather than the window — see
    the note on `forming` in `systems/tending`.
  */
  const form = useTending((s) => s.form)
  const keys = useMenuKeys(1)

  const todo = useMemo(
    () => todoFor(practices, words, me, today, Date.now()),
    [practices, words, me, today],
  )

  const mine = practices.filter((p) => !p.restingAt && (p.by === me || p.by === 'both'))
  const language = mine.find((p) => p.kind === 'words')

  /*
    Honest about the difference between empty and not-answered-yet, the same
    way the Lantern Walk is. A first visit should read as an invitation; the
    same words shown to somebody with a year up here and a slow connection
    would be a lie.
  */
  const whisper = !loaded
    ? 'the hill is still coming'
    : mine.length === 0
      ? 'nothing lives here yet'
      : todo.words.length === 0 && todo.marks.length === 0
        ? 'everything kept today — the mist is off it'
        : [
            todo.words.length > 0 &&
              `${todo.words.length} word${todo.words.length === 1 ? '' : 's'} ready`,
            todo.marks.length > 0 &&
              `${todo.marks.length} to say you did`,
          ]
            .filter(Boolean)
            .join(' · ')

  return (
    <div className="threshold fold-threshold">
      <span className="threshold-whisper">{whisper}</span>

      {todo.words.length > 0 ? (
        <button
          ref={keys.ref(0)}
          type="button"
          onClick={() => begin(todo.words, todo.words.length + todo.marks.length)}
        >
          turn some over
        </button>
      ) : mine.length === 0 ? (
        <button ref={keys.ref(0)} type="button" onClick={() => form({ kind: 'take' })}>
          take something in
        </button>
      ) : null}

      {/*
        The practices the garden cannot check, offered one at a time.

        Plain words rather than a list of switches: each one is a sentence about
        a thing somebody did, and a row of toggles would turn the honest half of
        this section into a checklist — which is the shape it exists to avoid.
      */}
      {todo.marks.length > 0 && (
        <span className="fold-marks">
          {todo.marks.map((practice) => (
            <button
              key={practice.id}
              type="button"
              onClick={() => form({ kind: 'mark', id: practice.id })}
            >
              {practice.name}
            </button>
          ))}
          <em>on your word — nothing up here can check</em>
        </span>
      )}

      {mine.length > 0 && (
        <span className="fold-more">
          {language && (
            <button type="button" onClick={() => form({ kind: 'word', id: language.id })}>
              put a word in
            </button>
          )}
          <button type="button" onClick={() => form({ kind: 'take' })}>
            take something in
          </button>
        </span>
      )}

    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* the sitting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One word at a time, over the hillside.
 *
 * Self-graded, and that is a decision rather than a shortcut: typing an
 * accented answer on a phone to be told it is wrong by one character is not
 * learning a language, it is fighting a keyboard. A paper flashcard works this
 * way and it works.
 */
export function FoldSession() {
  const data = useData()
  const sitting = useTending((s) => s.sitting)
  const queue = useTending((s) => s.queue)
  const at = useTending((s) => s.at)
  const turned = useTending((s) => s.turned)
  const turnOver = useTending((s) => s.turnOver)
  const advance = useTending((s) => s.advance)
  const leave = useTending((s) => s.leave)

  const word = queue[at] ?? null
  const done = sitting && at >= queue.length

  const say = (got: boolean) => {
    if (!word) return
    /*
      The write is fired and not awaited, and the queue moves at once.

      Waiting for Firestore between two words would put a pause in the one
      interaction that has to feel like turning cards over — and the write
      cannot meaningfully fail from the reader's point of view: it is wrapped
      in `attempt`, which is what surfaces trouble everywhere else in the
      garden, and a schedule that missed one turn asks the same word again
      tomorrow. That is the correct recovery and it needs no interface.
    */
    void attempt('that word', () => data.turnWord(word.id, got))
    ambience.cue('paper')
    advance()
  }

  /*
    A keyboard, because half of the learning either of them does will be at a
    desk. Space and Enter turn it over; then left is "not yet" and right is
    "I had it", which is the same left-and-right the archive's ratings and the
    Stars' navigation already use.
  */
  useEffect(() => {
    if (!sitting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        leave()
        return
      }
      if (!word) return
      if (!turned && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        turnOver()
        return
      }
      if (!turned) return
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        say(true)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        say(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!sitting) return null

  if (done) {
    return (
      <div className="fold-sitting is-done">
        <p className="fold-through">that is all of them</p>
        <button type="button" onClick={leave}>
          stay a while
        </button>
      </div>
    )
  }

  if (!word) return null

  return (
    <div className="fold-sitting">
      {/*
        A word handed over says so, above itself, and it is the only label in
        the whole section. Not decoration: learning a word because she left it
        for you is a different act from learning one off a list, and the reader
        has to know which one this is *before* they try to remember it.
      */}
      {word.handed && word.by !== data.me && (
        <span className="fold-handed">left for you</span>
      )}

      <button
        type="button"
        className="fold-word"
        onClick={() => !turned && turnOver()}
        aria-label={turned ? word.text : `${word.text} — turn it over`}
      >
        {word.text}
      </button>

      {turned ? (
        <>
          <p className="fold-meaning">{word.meaning}</p>
          {word.note && <p className="fold-note">{word.note}</p>}
          <span className="fold-answers">
            <button type="button" onClick={() => say(false)}>
              not yet
            </button>
            <button type="button" onClick={() => say(true)}>
              I had it
            </button>
          </span>
        </>
      ) : (
        <span className="fold-turn">turn it over</span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* the three small forms                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Saying you did one of the things the garden cannot see.
 *
 * The line is optional and it is asked for anyway, because the line is the
 * thing the *other* one reads — "what were you working on" is the only question
 * anybody asks across seven timezones, and a tick cannot answer it.
 */
function Mark({ id, onDone }: { id: string; onDone: () => void }) {
  const data = useData()
  const today = useToday()
  const practice = useTending((s) => s.practices.find((p) => p.id === id))
  const markDone = useTending((s) => s.markDone)
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => field.current?.focus(), [])
  if (!practice) return null

  const keep = async () => {
    setBusy(true)
    const ok = await attempt('that day', () => data.practise(id, today, line))
    if (ok) markDone(id)
    onDone()
  }

  return (
    <FormSheet title={practice.name} onClose={onDone}>
      <p className="fold-form-said">what did you do?</p>
      <input
        ref={field}
        value={line}
        maxLength={300}
        placeholder="a line, if you want one"
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void keep()
        }}
      />
      <button type="button" disabled={busy} onClick={() => void keep()}>
        {busy ? 'keeping it' : 'I did it today'}
      </button>
    </FormSheet>
  )
}

/** A word, and whether it is being handed over. */
function AddWord({ practiceId, onDone }: { practiceId: string; onDone: () => void }) {
  const data = useData()
  const [text, setText] = useState('')
  const [meaning, setMeaning] = useState('')
  const [note, setNote] = useState('')
  const [handed, setHanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])

  const whole = text.trim() !== '' && meaning.trim() !== ''

  const put = async () => {
    if (!whole) return
    setBusy(true)
    // `attempt` wants a void promise; the new word itself is not needed here —
    // the subscription brings it back like everything else in this garden.
    await attempt('that word', async () => {
      await data.addWord({ practiceId, text, meaning, note, handed })
    })
    onDone()
  }

  return (
    <FormSheet title="a word" onClose={onDone}>
      <input
        ref={field}
        value={text}
        maxLength={120}
        placeholder="the word"
        onChange={(e) => setText(e.target.value)}
      />
      <input
        value={meaning}
        maxLength={240}
        placeholder="what it means"
        onChange={(e) => setMeaning(e.target.value)}
      />
      {/*
        Where you met it. The single most useful thing on a flashcard and the
        thing every shipped deck lacks — a word you met somewhere has a hook on
        it. Optional, and asked for last so it never blocks putting one in.
      */}
      <input
        value={note}
        maxLength={240}
        placeholder="where you met it (optional)"
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        className={handed ? 'fold-handing is-on' : 'fold-handing'}
        aria-pressed={handed}
        onClick={() => setHanded((v) => !v)}
      >
        {handed ? 'leaving it for them' : 'leave it for them'}
      </button>
      <button type="button" disabled={!whole || busy} onClick={() => void put()}>
        {busy ? 'putting it in' : 'put it in'}
      </button>
    </FormSheet>
  )
}

const CREATURE_NAMES: Record<CreatureKind, string> = {
  dog: 'a dog',
  hare: 'a hare',
  goat: 'a goat',
  crane: 'a crane',
  fox: 'a fox',
  ox: 'an ox',
}

/** Taking an animal in, which is how a practice starts. */
function TakeIn({ onDone }: { onDone: () => void }) {
  const data = useData()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PracticeKind>('days')
  const [by, setBy] = useState<PracticeOwner>(data.me)
  const [creature, setCreature] = useState<CreatureKind>('hare')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])

  const take = async () => {
    if (name.trim() === '') return
    setBusy(true)
    await attempt('that practice', async () => {
      await data.takeIn({ name, kind, by, creature })
    })
    onDone()
  }

  return (
    <FormSheet title="take something in" onClose={onDone}>
      <input
        ref={field}
        value={name}
        maxLength={80}
        placeholder="what are you getting better at?"
        onChange={(e) => setName(e.target.value)}
      />

      <span className="fold-pick">
        <button
          type="button"
          className={kind === 'days' ? 'is-on' : ''}
          onClick={() => setKind('days')}
        >
          I do it out there
        </button>
        <button
          type="button"
          className={kind === 'words' ? 'is-on' : ''}
          onClick={() => setKind('words')}
        >
          it has words to learn
        </button>
      </span>
      {/*
        Said plainly at the moment it matters, because it is the one promise
        this section makes about itself. The garden can run a language; it
        cannot hear you play the guitar, and a place that implied otherwise
        would be lying in the honest-states sense.
      */}
      <p className="fold-form-said">
        {kind === 'words'
          ? 'the hill will keep the words and bring them back when you are about to lose them'
          : 'the hill will remember that you did it, and take your word for it'}
      </p>

      <span className="fold-pick">
        <button
          type="button"
          className={by === data.me ? 'is-on' : ''}
          onClick={() => setBy(data.me)}
        >
          mine
        </button>
        <button
          type="button"
          className={by === 'both' ? 'is-on' : ''}
          onClick={() => setBy('both')}
        >
          ours
        </button>
      </span>

      <span className="fold-pick fold-creatures">
        {CREATURE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={creature === k ? 'is-on' : ''}
            onClick={() => setCreature(k)}
          >
            {CREATURE_NAMES[k]}
          </button>
        ))}
      </span>

      <button type="button" disabled={name.trim() === '' || busy} onClick={() => void take()}>
        {busy ? 'letting it in' : 'let it in'}
      </button>
    </FormSheet>
  )
}

/**
 * The one thing in this section that covers the world.
 *
 * Writing needs somewhere to write — a keyboard comes up over half a phone and
 * a field floating on a hillside behind it is unreadable. Forms are already the
 * garden's stated exception to "no panels", and this is the same sheet the rest
 * of them use rather than a second idea about what a form looks like.
 */
function FormSheet({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fold-form" role="dialog" aria-label={title}>
      <button className="fold-form-close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

/**
 * Everything the Fold puts over the world, in one mount.
 *
 * `App` renders this beside the other overlays. Both halves are null unless the
 * Fold has something to say, so it costs nothing anywhere else in the garden.
 */
export function FoldSitting() {
  const touched = useTending((s) => s.touched)
  const sitting = useTending((s) => s.sitting)
  const forming = useTending((s) => s.forming)
  const form = useTending((s) => s.form)
  const shut = () => form(null)

  return (
    <>
      <FoldSession />
      {/* Not while the words are up: one line of text over another. */}
      {!sitting && <FoldTouched id={touched} />}
      {/*
        The forms, rendered here and *opened* from the threshold — because this
        is the top level and a fixed sheet needs the window as its containing
        block. See the note on `forming` in `systems/tending`.
      */}
      {forming?.kind === 'take' && <TakeIn onDone={shut} />}
      {forming?.kind === 'word' && forming.id && (
        <AddWord practiceId={forming.id} onDone={shut} />
      )}
      {forming?.kind === 'mark' && forming.id && <Mark id={forming.id} onDone={shut} />}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* what the animals are, in words                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a tap on an animal says.
 *
 * One line, on the world, and it goes away on the next tap. Deliberately not a
 * panel with statistics in it: the animal already says how big it is and how
 * far off it is standing, and repeating those as numbers would be the section
 * explaining its own picture back to you.
 */
export function FoldTouched({ id }: { id: string | null }) {
  const today = useToday()
  const data = useData()
  const practice = useTending((s) => s.practices.find((p) => p.id === id))
  const words = useTending((s) => s.words)
  const [busy, setBusy] = useState(false)
  if (!practice) return null

  const condition = conditionOf(practice, today)
  const recent = keptRecently(practice, today, 14)
  const whose =
    practice.by === 'both'
      ? 'ours'
      : practice.by === data.me
        ? 'yours'
        : data.snapshot().profiles[practice.by].name

  const how = practice.restingAt
    ? 'resting'
    : keptToday(practice, today)
      ? 'kept today'
      : condition.since === 1
        ? 'kept yesterday'
        : condition.since > 300
          ? 'never yet'
          : `${condition.since} days since`

  return (
    <div className="fold-touched">
      <strong>{practice.name}</strong>
      <span>
        {whose} · {how} · {recent} of the last fourteen
      </span>
      {practice.kind === 'words' && (
        <span>{metCount(words.filter((w) => w.practiceId === practice.id), data.me)} words met</span>
      )}
      {practice.lastLine && <em>“{practice.lastLine}”</em>}

      {/*
        Letting one rest, and it is not optional furniture.

        Without it a practice somebody has genuinely given up on asks to be
        marked every single day, for ever — which is a nagging list, and a
        nagging list is precisely the thing this place was built not to be. The
        animal stays on the hill and stops being counted; nothing is deleted,
        because deleting it would take the weeks they *did* keep it as well.

        Only the owner, and only theirs or a shared one. Hers is not yours to
        put away.
      */}
      {(practice.by === data.me || practice.by === 'both') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void attempt('that animal', () =>
              data.restPractice(practice.id, !practice.restingAt),
            ).then(() => setBusy(false))
          }}
        >
          {practice.restingAt ? 'start feeding it again' : 'let it rest'}
        </button>
      )}
    </div>
  )
}
