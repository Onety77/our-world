/**
 * The emoji keyboard, for the machines that do not have one.
 *
 * ---------------------------------------------------------------------------
 * **Desktop only, and driven from the keyboard, because that is the whole
 * problem it exists for.**
 *
 * A phone has an emoji key on its keyboard. A laptop has a system panel behind
 * a chord most people cannot remember, which loses the focus of what you were
 * typing and takes a hand off the keys — which matters most in the one place it
 * comes up hardest, sitting through a film together with one hand on the
 * keyboard.
 *
 * So: a shortcut opens it, the arrow keys move, Enter puts it in the message
 * and closes, Escape leaves. The mouse works too, but nothing here needs it.
 *
 * It never appears on a touch device — see `Ink`. Putting a second emoji
 * keyboard on a phone that already has one is clutter, and it would fight the
 * native one for the same tap.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmoji } from '@/systems/emoji'

/** Emoji to a row. The grid is a fixed shape so the arrow keys are predictable. */
const ACROSS = 8

/** Rows shown before it scrolls. Eight by five is forty, which is plenty to scan. */
const DOWN = 5

export function EmojiBoard({
  onPick,
  onClose,
}: {
  onPick(emoji: string): void
  onClose(): void
}) {
  const inOrder = useEmoji((s) => s.inOrder)
  const all = useEmoji((s) => s.all)
  const used = useEmoji((s) => s.used)
  const pick = useEmoji((s) => s.pick)
  const add = useEmoji((s) => s.add)
  const drop = useEmoji((s) => s.drop)

  /*
    The order is frozen while the board is open.

    Picking one bumps its count, and re-sorting under the cursor mid-choice
    would move everything the instant you commit — so the list you opened is
    the list you are choosing from, and the new order arrives next time.
  */
  const list = useMemo(() => inOrder(), [inOrder, all, used])

  const [at, setAt] = useState(0)
  const [adding, setAdding] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const board = useRef<HTMLDivElement>(null)
  const paste = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) paste.current?.focus()
    else board.current?.focus()
  }, [adding])

  const take = (emoji: string) => {
    pick(emoji)
    onPick(emoji)
    onClose()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    const last = list.length - 1
    const move = (to: number) => {
      e.preventDefault()
      setAt(Math.max(0, Math.min(last, to)))
    }
    if (e.key === 'ArrowRight') move(at + 1)
    else if (e.key === 'ArrowLeft') move(at - 1)
    else if (e.key === 'ArrowDown') move(at + ACROSS)
    else if (e.key === 'ArrowUp') {
      // Up from the top row leaves the board rather than sticking — the field
      // you were typing in is up there, and that is where you meant to go.
      if (at < ACROSS) {
        e.preventDefault()
        onClose()
      } else move(at - ACROSS)
    } else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(last)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const emoji = list[at]
      if (emoji) take(emoji)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      // Taking one off your own keyboard, from the keyboard.
      e.preventDefault()
      const emoji = list[at]
      if (emoji) {
        drop(emoji)
        setAt((was) => Math.max(0, Math.min(was, list.length - 2)))
      }
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      setAdding(true)
    }
  }

  // Keep the cursor in view when the arrows walk it past the visible rows.
  useEffect(() => {
    board.current
      ?.querySelector<HTMLElement>(`[data-at="${at}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const tryAdd = (text: string) => {
    const got = add(text)
    if (got) {
      setSaid(null)
      setAdding(false)
      setAt(0)
    } else {
      setSaid('that is not an emoji — paste just the character')
    }
  }

  return (
    <div className="emoji" role="dialog" aria-label="emoji">
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
        {list.map((emoji, i) => (
          <button
            key={emoji}
            id={`emoji-${i}`}
            data-at={i}
            type="button"
            role="option"
            aria-selected={i === at}
            className={i === at ? 'on' : ''}
            // Pointer moves the cursor as well, so the two ways of choosing
            // never disagree about where you are.
            onMouseEnter={() => setAt(i)}
            onClick={() => take(emoji)}
            tabIndex={-1}
          >
            {emoji}
          </button>
        ))}
      </div>

      {adding ? (
        <div className="emoji-add">
          <input
            ref={paste}
            type="text"
            aria-label="paste an emoji"
            placeholder="paste one here"
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                tryAdd(e.currentTarget.value)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setAdding(false)
                setSaid(null)
              }
            }}
            onPaste={(e) => {
              // Straight in on paste, because pasting *is* the whole gesture —
              // asking for a second key afterwards is a step for nothing.
              const text = e.clipboardData.getData('text')
              if (text) {
                e.preventDefault()
                tryAdd(text)
              }
            }}
          />
          <span className="emoji-said">{said ?? 'paste it, or press escape'}</span>
        </div>
      ) : (
        <div className="emoji-foot">
          <button type="button" className="emoji-more" onClick={() => setAdding(true)}>
            add one
          </button>
          <span className="emoji-said">
            arrows to choose · enter to put it in · + to add · backspace to remove
          </span>
        </div>
      )}
    </div>
  )
}
