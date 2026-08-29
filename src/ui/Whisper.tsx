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
import { heartedBy, messageById, useTalking } from '@/systems/talking'
import { useSaidGestures } from './Said'
import type { Message, UserId } from '@/data/types'
import { useSections } from '@/systems/sections'
import { SECTIONS } from '@/sections/registry'

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
 * The same gestures as the sky — right-click, double-tap, swipe to answer —
 * because these are the same messages and there is no version of this where
 * the two surfaces disagree about what a message can do. See `ui/Said`.
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
  const gestures = useSaidGestures(message)
  const yours = heartedBy(message, me)
  const hers = heartedBy(message, me === 'warm' ? 'cool' : 'warm')
  const mine = message.by === me

  return (
    <p className={`whisper-said ${mine ? 'mine' : 'hers'}`} {...gestures}>
      <span className="whisper-who">{mine ? 'you' : theirName}</span>
      <span className="whisper-body">{message.body}</span>
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
  const replyTo = useTalking((s) => s.replyTo)
  const answer = useTalking((s) => s.answer)
  const profiles = useWorldSlice((s) => s.profiles)
  const lastReadAt = useWorldSlice((s) => s.lastReadAt)
  const inTheStars = useInTheStars()

  const them = profiles[me === 'warm' ? 'cool' : 'warm']
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  const recent = useMemo(() => messages.slice(-RECENT), [messages])
  const answering = messageById(messages, replyTo)

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
    const sent = await attempt('that didn’t send', () =>
      data.sendMessage(text, replyTo ?? undefined),
    )
    // Only let go of the words once they are actually somewhere.
    if (!sent) return
    setDraft('')
    answer(null)
    ambience.said(true)
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
    <div className="whisper open">
      <div className="whisper-recent">
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
      </div>

      {answering && (
        <p className="whisper-answering">
          <span className="whisper-quote">{answering.body}</span>
          <button type="button" className="whisper-drop" onClick={() => answer(null)}>
            not that one
          </button>
        </p>
      )}

      <div className="whisper-write">
        <textarea
          ref={field}
          className="ink whisper-field"
          value={draft}
          onChange={(e) => write(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void say()
            }
          }}
          rows={1}
          placeholder={`to ${them.name}`}
          aria-label={`say something to ${them.name}`}
        />
        <button type="button" className="whisper-send" onClick={() => void say()}>
          send
        </button>
      </div>

      <button type="button" className="whisper-fold-away" onClick={() => setOpen(false)}>
        fold away
      </button>
    </div>
  )
}
