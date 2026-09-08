import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { EmojiBoard } from '@/ui/Emoji'

/**
 * Whether this machine already has an emoji key.
 *
 * A phone does, on its own keyboard, and a second one drawn over the top would
 * be clutter fighting the native one for the same tap. A laptop does not — it
 * has a system panel behind a chord, which takes the focus away from what you
 * were writing and needs a hand off the keys. So the board is desktop only, and
 * this is the line that decides it.
 */
const HAS_ONE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

export interface InkProps {
  value: string
  onChange(value: string): void
  className?: string
  label: string
  placeholder?: string
  onKeyDown?(event: KeyboardEvent<HTMLTextAreaElement>): void
  /*
    Whether this field has the keyboard.

    Passed through rather than watched from outside because only the field
    knows, and two places now need to: the night screen makes room for search
    results while somebody is looking, and a composer that is being written in
    is a composer that keeps its own spaces.
  */
  onFocus?(): void
  onBlur?(): void
  /** Focus it as soon as it appears. */
  autoFocus?: boolean
  /** The element itself, for places that deliberately restore the cursor. */
  innerRef?: RefObject<HTMLTextAreaElement | null>
}

/**
 * The garden's plain-text writing surface.
 *
 * This is deliberately a real textarea. iOS owns the keyboard's form
 * assistant and exposes no web API for hiding it; changing this to a
 * contenteditable element does not escape WebKit's native text editor and only
 * makes selection, dictation, composition and accessibility less dependable.
 */
export function Ink({
  value,
  onChange,
  className,
  label,
  placeholder,
  onKeyDown,
  onFocus,
  onBlur,
  autoFocus,
  innerRef,
}: InkProps) {
  const own = useRef<HTMLTextAreaElement>(null)
  const box = innerRef ?? own
  const [board, setBoard] = useState(false)

  /**
   * Where the cursor was when the board was opened.
   *
   * ---------------------------------------------------------------------------
   * **Read on the way in, not on the way out, and that is the whole of the bug
   * this fixes.**
   *
   * Every emoji used to land at position zero, in front of whatever had already
   * been written — always, however long the sentence. Two things were doing it:
   * opening the board moved focus onto the grid, and the board used to be
   * rendered *inside a new wrapper element*, which changed the shape of the
   * React tree and made React throw the textarea away and build another one. A
   * fresh textarea has its caret at zero, so that is where everything went.
   *
   * The wrapper is gone — the board is a portal placed from this field's
   * rectangle — and the caret is now taken at the moment the chord is pressed,
   * while the field still has it. Nothing after that can lose it.
   * ---------------------------------------------------------------------------
   */
  const caret = useRef<{ from: number; to: number } | null>(null)

  /**
   * Put an emoji where the cursor is, and leave the cursor after it.
   *
   * Written through the caret rather than appended, because the reason to open
   * this mid-sentence is to put something *in* the sentence — and a picker that
   * always lands at the end is one you can only use when you have finished
   * typing, which is exactly when you do not need it.
   */
  const insert = (emoji: string) => {
    const el = box.current
    if (!el) {
      onChange(value + emoji)
      return
    }
    /*
      The remembered caret, and the live one only as a fallback — a board opened
      by clicking rather than by the chord has no remembered position, and the
      end of what you have written is the honest guess for that.
    */
    const held = caret.current
    const from = held ? Math.min(held.from, value.length) : (el.selectionStart ?? value.length)
    const to = held ? Math.min(held.to, value.length) : (el.selectionEnd ?? from)
    onChange(value.slice(0, from) + emoji + value.slice(to))
    // After the state has landed, so the caret is not moved by the re-render.
    requestAnimationFrame(() => {
      const back = box.current
      if (!back) return
      back.focus()
      const at = from + emoji.length
      back.setSelectionRange(at, at)
    })
  }

  // Keep the single-line resting shape and grow only when the message wraps.
  // CSS caps the result; overflow remains scrollable for long drafts.
  const fit = () => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    fit()
  }, [value])

  useEffect(() => {
    if (autoFocus) box.current?.focus()
  }, [autoFocus])

  /*
    The shortcut.

    **Alt+E**, and Alt is the one modifier this garden does not already spend.
    Ctrl and Cmd belong to the browser, Shift belongs to Enter — which is how a
    message gets a second line — and a bare key cannot be it because every bare
    key is a character you meant to type. Alt+E is close to the home row, does
    nothing else in any browser, and is the same chord on both machines.

    Handled before the field's own `onKeyDown`, so a place that binds Enter or
    Escape for sending never has to know this exists.
  */
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!HAS_ONE && event.altKey && !event.ctrlKey && !event.metaKey) {
      const key = event.key.toLowerCase()
      if (key === 'e') {
        event.preventDefault()
        // Taken here, while this field still holds the cursor. See `caret`.
        const el = box.current
        caret.current = el
          ? { from: el.selectionStart ?? value.length, to: el.selectionEnd ?? value.length }
          : null
        setBoard((was) => !was)
        return
      }
    }
    onKeyDown?.(event)
  }

  const field = (
    <textarea
      ref={box}
      className={className}
      value={value}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      inputMode="text"
      enterKeyHint="enter"
      autoComplete="off"
      autoCorrect="on"
      autoCapitalize="sentences"
      spellCheck
      translate="no"
      wrap="soft"
      onChange={(event) => onChange(event.currentTarget.value)}
      onInput={fit}
      onKeyDown={keys}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )

  /*
    The field is returned exactly as it was, always.

    No wrapper, on any machine, in any state. `Ink` sits inside five different
    layouts that position it directly — the film's composer, the whisper's
    corner, the Stars' bar — so an element appearing around it would move all of
    them; and, worse, appearing *conditionally* rebuilt the input and threw the
    cursor away every time the board opened. The board is a portal placed from
    this field's own rectangle instead, so it can be as free of the layout as it
    likes without touching it.
  */
  return (
    <>
      {field}
      {!HAS_ONE && board ? (
        <EmojiBoard
          anchor={box.current}
          onPick={insert}
          onClose={() => {
            setBoard(false)
            const el = box.current
            if (el) {
              el.focus()
              // Back where it was, so typing carries on from the emoji.
              const held = caret.current
              if (held) {
                const back = Math.min(held.from, el.value.length)
                el.setSelectionRange(back, back)
              }
            }
          }}
        />
      ) : null}
    </>
  )
}
