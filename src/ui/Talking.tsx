/**
 * The words in the Stars.
 *
 * The lights are drawn in the scene (`sections/stars/Conversation`); this is
 * the text hanging on them. DOM rather than geometry, for one reason that
 * matters more than the rest: a conversation is the last thing in this world
 * that should be a picture of words. Here it can be selected, copied, read
 * aloud by a screen reader, and scaled by somebody who has set a larger type
 * size — and it is sharp, which type baked into a WebGL texture at this size
 * is not.
 *
 * No panel, no bubble, no card. Each message is text lying on the sky with the
 * garden's lift shadow under it, which is the design law and is also simply
 * what looks right against a star field. Depth is done with size and opacity
 * rather than perspective maths: the further back in the conversation, the
 * smaller and fainter, until it is only a light with no words left on it.
 *
 * The whole column leans against the pointer, so it sits *in* the sky rather
 * than on the glass in front of it.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { useSections } from '@/systems/sections'
import { SECTIONS } from '@/sections/registry'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { gaze } from '@/systems/pointerLook'
import { useTakenOver } from '@/systems/attention'
import { toNewest, useTalking, walk } from '@/systems/talking'

/** How many messages carry legible words at once, above and below the head. */
const ABOVE = 7
const BELOW = 2

function spoken(at: number): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  // The date only when it is not today. Most of a conversation happens on the
  // day you are reading it, and "AUG 22" nine times down a column is furniture.
  if (d.toDateString() === new Date().toDateString()) return time
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `${day} · ${time}`
}

/**
 * Whether this message needs its time written under it.
 *
 * Only when it says something you did not already know: the first one, a new
 * day, or a real gap since the last. Six identical stamps down a column is
 * noise, and noise is the thing this place has least room for — you are
 * looking at a sky.
 */
const A_WHILE = 20 * 60 * 1000

function marksTime(at: number, previous: number | null): boolean {
  if (previous === null) return true
  if (at - previous > A_WHILE) return true
  return new Date(at).toDateString() !== new Date(previous).toDateString()
}

/**
 * Whether the Stars is the place currently open.
 *
 * The overlay is mounted for the whole world, so it has to ask — the section
 * registry is the only thing that knows which index the Stars ended up at, and
 * hard-coding 3 here would break the moment a section is added before it.
 */
function useInTheStars(): boolean {
  const index = useSections((s) => s.index)
  const entered = useSections((s) => s.entered)
  const takenOver = useTakenOver()
  return entered && !takenOver && SECTIONS[index]?.id === 'stars'
}

export function Talking() {
  const here = useInTheStars()
  const data = useData()
  const me = data.me
  const messages = useTalking((s) => s.messages)
  const loading = useTalking((s) => s.loading)
  const composing = useTalking((s) => s.composing)
  const startWriting = useTalking((s) => s.startWriting)
  const stopWriting = useTalking((s) => s.stopWriting)
  const profiles = useWorldSlice((s) => s.profiles)
  const lastReadAt = useWorldSlice((s) => s.lastReadAt)

  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  // --- the feed -------------------------------------------------------------
  useEffect(() => data.watchMessages((m) => useTalking.getState().setMessages(m)), [data])

  /*
    Being here is what "read" means.

    Not scrolling past, not receiving — being in the Stars with it on screen.
    It is the only claim the garden can make about it that is actually true,
    and the honesty law says make only those.
  */
  useEffect(() => {
    if (!here) return
    void data.markMessagesRead()
  }, [here, data, messages.length])

  useEffect(() => {
    if (here) toNewest()
  }, [here])

  // --- walking back ---------------------------------------------------------
  const column = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!here) return

    const onWheel = (e: WheelEvent) => {
      if (useTalking.getState().composing) return
      // Down through the wheel is back through time, the way a scrollback goes.
      walk.to += e.deltaY * 0.006
    }

    let dragging = false
    let lastY = 0
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest('button, input, textarea, a')) return
      dragging = true
      lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dy = e.clientY - lastY
      lastY = e.clientY
      // Dragging down pulls the older messages toward you, the way dragging a
      // sheet of paper moves the paper.
      walk.to += dy * 0.014
    }
    const up = () => {
      dragging = false
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [here])

  /*
    Per frame, and never through React.

    Every line's size, opacity and offset changes continuously as the sky is
    walked through. Rendering that from state would be a re-render per frame of
    a list — the exact thing the technical law is about. So React puts the
    lines in the document once and this writes their styles directly.
  */
  useEffect(() => {
    if (!here) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const root = column.current
      if (!root) return

      const lines = root.children
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i] as HTMLElement
        const own = Number(el.dataset.age ?? '0')
        const age = own - walk.at
        /*
          Which side of the column it sits on.

          Colour alone was not enough. Warm cream and cool blue-white are
          plainly different on a dark sky and nearly identical against her
          dawn, which is exactly where the newest messages hang — so the one
          cue was failing in the one place it mattered. A lean reads instantly
          at any brightness and still needs no bubble.

          Proportional to the window, not a fixed forty pixels: the column is
          already 78% of a narrow screen, and a fixed lean pushed the longest
          lines straight off the right-hand edge of a phone.
        */
        const lean = Math.min(44, window.innerWidth * 0.055)
        const side = el.dataset.by === 'me' ? lean : -lean

        // Above the head is the past, below it is the newest few.
        const lift = -age * 74
        const shrink = Math.max(0.42, 1 - Math.max(0, age) * 0.055)
        const fade =
          age < -0.9
            ? // Below the read head is the future you have scrolled away from.
              // It has to be gone before it reaches the composer, or a ghost
              // line sits on top of the invitation to write the next one.
              Math.max(0, 1 + (age + 0.9) * 2.2)
            : Math.max(0, 1 - Math.max(0, age - 4.5) / 4)

        el.style.transform =
          `translate3d(${side + gaze.yaw * -150 + Math.sin(own * 1.7) * 6}px,` +
          ` ${lift + gaze.pitch * 90}px, 0) scale(${shrink})`
        el.style.opacity = String(fade)
        // Once a line is faint enough to be unreadable it must also stop
        // catching the pointer, or the newest message sits under a stack of
        // invisible ones.
        el.style.pointerEvents = fade > 0.5 ? 'auto' : 'none'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [here, messages])

  // --- writing --------------------------------------------------------------
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composing) field.current?.focus()
  }, [composing])

  useEffect(() => {
    if (!here && composing) stopWriting()
  }, [here, composing, stopWriting])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!here) return
      if (e.key === 'Escape' && composing) {
        stopWriting()
        return
      }
      // Anything typed with nothing else focused opens the composer and keeps
      // the character — you should be able to just start saying something.
      if (
        !composing &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target as HTMLElement)?.closest('input, textarea')
      ) {
        setDraft((d) => d + e.key)
        startWriting()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [here, composing, startWriting, stopWriting])

  const write = (next: string) => {
    const grew = next.length - draft.length
    if (grew === 1) ambience.nib(0.4 + Math.random() * 0.25)
    else if (grew > 1) ambience.nib(0.85)
    else if (grew < 0) ambience.nib(0.35, true)
    setDraft(next)
  }

  async function say() {
    const text = draft.trim()
    if (text === '') return
    const sent = await attempt('that didn’t send', () => data.sendMessage(text))
    // Only let go of the words once they are actually somewhere.
    if (!sent) return
    setDraft('')
    stopWriting()
    toNewest()
  }

  const lines = useMemo(() => {
    const newest = messages.length - 1
    return messages
      .map((m, i) => ({
        m,
        age: newest - i,
        stamped: marksTime(m.at, i > 0 ? messages[i - 1].at : null),
      }))
      .filter(({ age }) => age <= ABOVE + 40 && age >= -BELOW)
  }, [messages])

  /** Hers, said since the last time you were here. */
  const unread = useMemo(
    () => messages.filter((m) => m.by !== me && m.at > (lastReadAt?.[me] ?? 0)).length,
    [messages, me, lastReadAt],
  )

  if (!here) return null

  return (
    <div className="talking">
      <div className="sky-column" ref={column}>
        {lines.map(({ m, age, stamped }) => (
          <p
            key={m.id}
            data-age={age}
            data-by={m.by === me ? 'me' : 'them'}
            className={`said ${m.by === me ? 'mine' : 'hers'}`}
          >
            <span className="said-body">{m.body}</span>
            {stamped && <span className="said-when">{spoken(m.at)}</span>}
          </p>
        ))}
      </div>

      {messages.length === 0 && !loading && (
        <p className="sky-empty">
          Nothing here yet. Whatever you say first will be the lowest light in
          the sky.
        </p>
      )}

      {composing ? (
        <div className="saying">
          <textarea
            ref={field}
            className="saying-field ink"
            value={draft}
            onChange={(e) => write(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void say()
              }
            }}
            rows={1}
            placeholder={`say something to ${them.name}`}
            aria-label={`say something to ${them.name}`}
          />
          <div className="saying-actions">
            <button type="button" className="say-it" onClick={() => void say()}>
              send it up
            </button>
            <button type="button" className="say-not" onClick={stopWriting}>
              not now
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="start-saying" onClick={startWriting}>
          <span className="start-saying-hint">
            {unread > 0
              ? `${unread} from ${them.name}, since you were last here`
              : 'one light each, for as long as you like'}
          </span>
          <span className="start-saying-name">say something</span>
        </button>
      )}
    </div>
  )
}
