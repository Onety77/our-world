/**
 * The emoji keyboard, for the machines that do not have one.
 *
 * ---------------------------------------------------------------------------
 * **Desktop only, driven from the keyboard, and positioned against the field it
 * belongs to rather than wrapped around it.**
 *
 * A phone has an emoji key. A laptop has a system panel behind a chord most
 * people cannot remember, which loses the focus of whatever you were typing —
 * worst in the place it comes up hardest, sitting through a film together with
 * one hand on the keyboard.
 *
 * **It is a portal, and that is a bug fix rather than an architecture.** The
 * first version wrapped the textarea in a positioned element when it opened,
 * which changes the shape of the React tree — so React unmounted the input and
 * built a new one, losing the caret. Every emoji landed at position zero, in
 * front of whatever you had already written, *always*. Rendering somewhere else
 * entirely and placing it from the field's own rectangle leaves the input
 * completely alone.
 *
 * That also buys the flip: a board placed from a measured rectangle can look at
 * how much room is above it and open downward when there is not enough, which
 * is what the film's chat needs when it sits at the top of the screen.
 *
 * The price of the portal is that it is outside the composer by the DOM, and
 * the composer closes on an outside tap. It says `data-inside` for that, which
 * is how a panel declares it belongs to whatever is open.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEmoji } from '@/systems/emoji'

/** Emoji to a row. Fixed, so the arrow keys are predictable. */
const ACROSS = 8

/** Rows shown before it scrolls. Eight by five is plenty to scan. */
const DOWN = 5

/** How far from the field it sits, in pixels. */
const OFF = 8

export function EmojiBoard({
  anchor,
  onPick,
  onClose,
}: {
  /** The field this belongs to. Everything is placed from its rectangle. */
  anchor: HTMLElement | null
  onPick(emoji: string): void
  onClose(): void
}) {
  const all = useEmoji((s) => s.all)
  const add = useEmoji((s) => s.add)
  const drop = useEmoji((s) => s.drop)
  const move = useEmoji((s) => s.move)

  const [at, setAt] = useState(0)
  const [editing, setEditing] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const board = useRef<HTMLDivElement>(null)
  const paste = useRef<HTMLInputElement>(null)

  /** Where the board sits, and whether it opened upward or down. */
  const [place, setPlace] = useState<{ left: number; top: number; under: boolean } | null>(null)

  /*
    Measured before the browser paints, so it never appears in the wrong place
    for a frame. Re-measured on scroll and resize, because the film's composer
    moves when the screen does.
  */
  useLayoutEffect(() => {
    if (!anchor) return
    const put = () => {
      const box = anchor.getBoundingClientRect()
      const wide = Math.min(24 * 16, window.innerWidth - 24)
      const tall = board.current?.offsetHeight ?? 260

      /*
        Above the field if it fits, below if it does not.

        The film's chat overlay sits at the *top* of the screen in full screen,
        and a board that always opened upward was simply cut off by the window —
        the one place it was most needed was the one place you could not read
        it. Room is measured rather than assumed, so it is right in both.
      */
      const under = box.top - tall - OFF < 8
      const top = under ? box.bottom + OFF : box.top - tall - OFF
      const left = Math.max(8, Math.min(window.innerWidth - wide - 8, box.left))
      setPlace({ left, top, under })
    }
    put()
    window.addEventListener('resize', put)
    window.addEventListener('scroll', put, true)
    return () => {
      window.removeEventListener('resize', put)
      window.removeEventListener('scroll', put, true)
    }
  }, [anchor, editing, all.length])

  useEffect(() => {
    if (editing) paste.current?.focus()
    else board.current?.focus()
  }, [editing])

  const take = (emoji: string) => {
    onPick(emoji)
    onClose()
  }

  const last = all.length - 1
  const clamp = (to: number) => Math.max(0, Math.min(last, to))

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (editing) setEditing(false)
      else onClose()
      return
    }

    const step = (by: number) => {
      e.preventDefault()
      /*
        In editing, a held shift moves the *emoji*; on its own it moves the
        cursor. One grid, two verbs, and the modifier says which — which is how
        every list anybody has reordered with a keyboard has ever worked.
      */
      if (editing && e.shiftKey) {
        const to = clamp(at + by)
        move(at, to)
        setAt(to)
      } else {
        setAt(clamp(at + by))
      }
    }

    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowDown') step(ACROSS)
    else if (e.key === 'ArrowUp') {
      // Up from the top row leaves, rather than sticking — the field you were
      // typing in is up there, and that is where you meant to go.
      if (at < ACROSS && !(editing && e.shiftKey)) {
        e.preventDefault()
        onClose()
      } else step(-ACROSS)
    } else if (e.key === 'Home') { e.preventDefault(); setAt(0) }
    else if (e.key === 'End') { e.preventDefault(); setAt(last) }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (editing) { setEditing(false); return }
      const emoji = all[at]
      if (emoji) take(emoji)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      const emoji = all[at]
      if (emoji) {
        drop(emoji)
        setAt((was) => Math.max(0, Math.min(was, all.length - 2)))
      }
    } else if (e.key === 'e' && (e.altKey || e.metaKey)) {
      // The same chord that opened it closes it, wherever the focus has gone.
      e.preventDefault()
      onClose()
    }
  }

  // Keep the cursor in view when the arrows walk it past the visible rows.
  useEffect(() => {
    board.current
      ?.querySelector<HTMLElement>(`[data-at="${at}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const tryAdd = (text: string, field: HTMLInputElement | null) => {
    const got = add(text)
    if (got) {
      setSaid(null)
      setAt(0)
      if (field) field.value = ''
    } else {
      setSaid('that is not an emoji — paste just the character')
    }
  }

  const host = useMemo(() => (typeof document === 'undefined' ? null : document.body), [])
  if (!host) return null

  return createPortal(
    <div
      className={`emoji${place?.under ? ' is-under' : ''}${editing ? ' is-editing' : ''}`}
      role="dialog"
      aria-label={editing ? 'edit your emoji' : 'emoji'}
      /*
        Part of the composer, however far from it this is rendered. Surfaces
        that close on an outside tap read this attribute — see
        `useDismissOutside` — because by the DOM a body portal is outside
        everything, and without it every click in here folded the composer away
        in the capture phase before the button under the mouse had been told.
      */
      data-inside=""
      style={place ? { left: `${place.left}px`, top: `${place.top}px` } : { opacity: 0 }}
    >
      <div
        className="emoji-grid"
        ref={board}
        tabIndex={-1}
        role="listbox"
        aria-label="emoji"
        aria-activedescendant={`emoji-${at}`}
        onKeyDown={onKey}
        style={{ ['--across' as string]: ACROSS, ['--down' as string]: DOWN }}
      >
        {all.map((emoji, i) => (
          <button
            key={emoji}
            id={`emoji-${i}`}
            data-at={i}
            type="button"
            role="option"
            aria-selected={i === at}
            className={i === at ? 'on' : ''}
            // The pointer moves the cursor too, so the two ways of choosing
            // never disagree about where you are.
            onMouseEnter={() => setAt(i)}
            onClick={() => {
              if (editing) setAt(i)
              else take(emoji)
            }}
            tabIndex={-1}
          >
            {emoji}
            {editing ? (
              <span
                className="emoji-off"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation()
                  drop(emoji)
                }}
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {editing ? (
        <div className="emoji-edit">
          <div className="emoji-nudge" role="group" aria-label="move this one">
            <button
              type="button"
              aria-label="move it earlier"
              onClick={() => { move(at, at - 1); setAt(clamp(at - 1)) }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="move it later"
              onClick={() => { move(at, at + 1); setAt(clamp(at + 1)) }}
            >
              ›
            </button>
          </div>
          <input
            ref={paste}
            type="text"
            aria-label="paste an emoji to add"
            placeholder="paste one to add"
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                tryAdd(e.currentTarget.value, e.currentTarget)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(false)
                setSaid(null)
              }
            }}
            onPaste={(e) => {
              // Straight in on paste, because pasting *is* the whole gesture.
              const text = e.clipboardData.getData('text')
              if (text) {
                e.preventDefault()
                tryAdd(text, e.currentTarget)
              }
            }}
          />
          <button type="button" className="emoji-more" onClick={() => setEditing(false)}>
            done
          </button>
          <span className="emoji-said">
            {said ?? 'shift + arrows move · × or backspace removes'}
          </span>
        </div>
      ) : (
        <div className="emoji-foot">
          <button type="button" className="emoji-more" onClick={() => setEditing(true)}>
            edit
          </button>
          <span className="emoji-said">arrows choose · enter puts it in</span>
        </div>
      )}
    </div>,
    host,
  )
}
