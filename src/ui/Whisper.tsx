/**
 * The conversation, folded into a corner.
 *
 * ---------------------------------------------------------------------------
 * **Why there are two ways to talk, and why that is not a duplicate.**
 *
 * The Stars is where a conversation *lives*: a sky you walk back through, one
 * light per thing either of you has ever said, and the whole history of the
 * two of you receding into the star field. It is somewhere you go.
 *
 * That is exactly the problem. Seven timezones apart, the moments you are both
 * awake are a sliver — and if the only way to answer her is to leave whatever
 * you are doing, browse to the Stars and enter it, then the answer is "later",
 * every time. Music had this same shape and got the same fix: it is not
 * somewhere you go, it is something happening while you are somewhere else.
 * So it shares the Player's corner. **Not the opposite one** — that was the
 * first attempt and it was wrong: the bottom left already holds the name of
 * the place you are looking at and the way into it, and the fix for two things
 * wanting one corner is to move one of them, not to make the other disappear.
 * Every corner of this world is spoken for, and these two belong together
 * anyway: neither music nor talking is somewhere you go. See `.corner`.
 *
 * **It is deliberately small.** The last three or four things said and a line
 * to write on — enough to answer with, not enough to read a year of. Anything
 * more and it stops being a corner and starts being a second Stars, which
 * would make the first one pointless. If you want the conversation, the sky is
 * still there and this says so.
 *
 * **And it stays up during a game.** That is most of the point of it: the
 * reason to have this at all is that she says something while you are three
 * guesses into a word duel, and a chat that hides exactly when you are busy is
 * a chat you cannot use. It is a line of text in a corner; it can cope.
 * ---------------------------------------------------------------------------
 *
 * No panel, no bubble, no card. Text on the world with the garden's lift
 * shadow, the same as the Player it mirrors — the design law does not get
 * suspended because a thing is useful.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { heartedBy, useTalking } from '@/systems/talking'
import type { Message, UserId } from '@/data/types'
import { useSections } from '@/systems/sections'
import { SECTIONS, sectionIndexById } from '@/sections/registry'
import { useDismissOutside } from './useDismissOutside'
import { Ink } from './Ink'

/** How many of the most recent are worth showing in a corner. */
const RECENT = 4

/**
 * Whether the Stars is already open in front of you.
 *
 * The corner folds itself away there, and only there. Two views of the same
 * conversation on screen at once is one of them being furniture — and it would
 * be the small one, sitting under the real thing repeating its last four
 * lines.
 */
function useInTheStars(): boolean {
  // The place on screen, not the one being travelled to — see the note on
  // `shown` in `systems/sections`. Anything drawing the inside of a place has
  // to arrive on the same frame the place does.
  const { entered, section: index } = useSections((s) => s.shown)
  return entered && SECTIONS[index]?.id === 'stars'
}

/**
 * One line in the corner.
 *
 * This surface is a glance, not a second message-action menu. The visible
 * hearts remain facts about the message, while tapping the recent conversation
 * travels to the full Stars where replying and reacting belong.
 */
function Line({
  message,
  me,
  theirName,
}: {
  message: Message
  me: UserId
  theirName: string
}) {
  const yours = heartedBy(message, me)
  const hers = heartedBy(message, me === 'warm' ? 'cool' : 'warm')
  const mine = message.by === me

  return (
    <p className={`whisper-said ${mine ? 'mine' : 'hers'}`}>
      <span className="whisper-who">{mine ? 'you' : theirName}</span>
      {/*
        Two spans, and the inner one is not decoration.

        The outer clamps to two lines, which needs `display: -webkit-box` and
        so cannot carry a background that hugs the words. The inner one is
        inline, which can: with `box-decoration-break: clone` every wrapped
        line gets its own bed, shaped to what was actually said. See
        `.whisper-ink`.
      */}
      <span className="whisper-body">
        <span className="whisper-ink">{message.body}</span>
      </span>
      {(yours || hers) && (
        <span className="said-hearts" aria-label="hearted">
          {yours && <i className="mine" aria-hidden="true">♥</i>}
          {hers && <i className="hers" aria-hidden="true">♥</i>}
        </span>
      )}
    </p>
  )
}

export function Whisper() {
  const data = useData()
  const me = data.me
  const messages = useTalking((s) => s.messages)
  const open = useTalking((s) => s.whispering)
  const setOpen = useTalking((s) => s.whisper)
  const answer = useTalking((s) => s.answer)
  const profiles = useWorldSlice((s) => s.profiles)
  const lastReadAt = useWorldSlice((s) => s.lastReadAt)
  const inTheStars = useInTheStars()

  const them = profiles[me === 'warm' ? 'cool' : 'warm']
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Folding keeps the draft in this mounted component, so an outside tap is
  // convenient without risking words that have not been sent yet.
  useDismissOutside(open, () => setOpen(false), [panel])

  const recent = useMemo(() => messages.slice(-RECENT), [messages])

  const openStars = () => {
    const stars = sectionIndexById('stars')
    SECTIONS[stars]?.Scene.warm()
    const sections = useSections.getState()
    sections.go(stars)
    sections.enter()
    answer(null)
    setOpen(false)
  }

  /** Hers, since the last time you were actually in the Stars. */
  const unread = useMemo(
    () => messages.filter((m) => m.by !== me && m.at > (lastReadAt?.[me] ?? 0)).length,
    [messages, me, lastReadAt],
  )

  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  /*
    Opening it is reading it.

    The same rule the Stars uses — "read" means you were there — and the corner
    qualifies: the last four things said are on the screen in front of you. It
    matters because without it the mark goes on breathing after you have plainly
    seen them, and a count that is wrong in the direction of "she is still
    waiting" is the one kind of wrong this garden cannot afford.
  */
  useEffect(() => {
    if (!open) return
    void data.markMessagesRead()
  }, [open, data, messages.length])

  /*
    Escape closes it, and nothing else takes the key.

    Bound while open only, so the racer's pause and the garden's own back are
    untouched every other moment. Not captured either — if a game wants Escape
    while you happen to have the corner open, the game is the thing you are
    looking at.
  */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const write = (next: string) => {
    const grew = next.length - draft.length
    if (grew === 1) ambience.nib(0.35 + Math.random() * 0.2)
    else if (grew > 1) ambience.nib(0.8)
    else if (grew < 0) ambience.nib(0.3, true)
    setDraft(next)
  }

  async function say() {
    const text = draft.trim()
    if (text === '') return
    const outgoing = {
      id: `said-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
    }
    const message: Message = { ...outgoing, by: me, body: text }
    useTalking.getState().queue(message)
    setDraft('')
    answer(null)
    ambience.said(true)
    field.current?.focus()
    const sent = await attempt('that didn’t send', () =>
      data.sendMessage(text, undefined, outgoing),
    )
    if (!sent) useTalking.getState().fail(outgoing.id)
    field.current?.focus()
  }

  /*
    Folded away on the way into the Stars.

    It returns null there regardless, but the *flag* has to come down with it,
    or walking back out into the garden lands you in an open composer you did
    not open.
  */
  useEffect(() => {
    if (inTheStars && open) setOpen(false)
  }, [inTheStars, open, setOpen])

  if (inTheStars) return null

  if (!open) {
    return (
      <button
        type="button"
        className={`whisper-fold ${unread > 0 ? 'waiting' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={
          unread > 0
            ? `${unread} unread ${unread === 1 ? 'message' : 'messages'} from ${them.name}`
            : `Open messages${recent.at(-1)?.body ? `; latest: ${recent.at(-1)!.body}` : ''}`
        }
      >
        <span className="whisper-mark" aria-hidden="true" />
        <span className="whisper-fold-words">
          {unread > 0
            ? `${unread} from ${them.name}`
            : (recent.at(-1)?.body ?? `say something to ${them.name}`)}
        </span>
        <span className="whisper-fold-mobile" aria-hidden="true">
          {unread > 0 ? `${unread} new` : 'messages'}
        </span>
      </button>
    )
  }

  return (
    <div ref={panel} className="whisper open">
      {/*
        The world, out of focus, for as long as this is open.

        Rendered here rather than by whatever is behind it, because this is the
        only thing that knows the corner is open — and it is a sibling *before*
        the panel so the panel paints on top of it and stays sharp. See
        `.whisper-hush`; it is a sheet rather than a filter on this element
        because there is no box here to filter through.
      */}
      <div className="whisper-hush on" aria-hidden="true" />
      <button
        type="button"
        className="whisper-recent"
        aria-label="open the full conversation in the Stars"
        onClick={openStars}
      >
        {recent.length === 0 ? (
          <p className="whisper-none">
            Nothing yet. The first thing said becomes the lowest light in the
            sky.
          </p>
        ) : (
          recent.map((m) => (
            <Line key={m.id} message={m} me={me} theirName={them.name} />
          ))
        )}
      </button>

      {/* This compact composer sends with either Return or its visible button. */}
      <div className="whisper-write">
        <Ink
          innerRef={field}
          className="ink whisper-field"
          value={draft}
          onChange={write}
          placeholder={`to ${them.name}`}
          label={`say something to ${them.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void say()
            }
          }}
        />
        <button
          type="button"
          className="whisper-send"
          disabled={draft.trim() === ''}
          // The field must not lose the cursor on the way to the button, or the
          // keyboard slides away between finishing a sentence and sending it.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => void say()}
        >
          send
        </button>
      </div>

      <button type="button" className="whisper-fold-away" onClick={() => setOpen(false)}>
        fold away
      </button>
    </div>
  )
}
