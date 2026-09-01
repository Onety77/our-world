/**
 * A line to write on that is not a form control.
 *
 * ---------------------------------------------------------------------------
 * **Why this exists: the bar iOS puts above the keyboard.**
 *
 * Focus a `<textarea>` on iOS and WebKit adds its own accessory bar over the
 * keyboard — a back arrow, a forward arrow and a Done tick. It is the *form
 * navigation* bar: its job is to walk you between the fields of a form and
 * dismiss the keyboard at the end of one. There is no attribute, no meta tag
 * and no CSS that turns it off, because it does not belong to the page.
 *
 * It was investigated rather than guessed at. The usual explanations do not
 * apply here and were ruled out by measuring the live document with the
 * composer open:
 *
 *   · it is not a `<form>` — the Stars composer has never had one
 *   · it is not a second field stealing focus — there is exactly one
 *     `input`/`textarea`/`select` in the whole document at that moment
 *   · it is not autofill — `autocomplete="off"` and `data-form-type="other"`
 *     were already set
 *
 * The bar is shown because the focused element *is a form control*. That is
 * the entire condition, and the arrows are simply inert when there is nowhere
 * to walk to — which is exactly what the screenshot shows.
 *
 * So the field stops being a form control. A `contenteditable` element raises
 * the same keyboard, takes the same typing, and gets no accessory bar, because
 * WebKit has no form to offer to navigate. `plaintext-only` is the important
 * half: it keeps paste as text and makes Return a newline rather than letting
 * the browser build markup inside a chat message.
 *
 * **Nothing about the look changes.** It is styled by whatever class the caller
 * passes, exactly as the textarea was, and it behaves as a controlled field:
 * the caller owns the value.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

export interface InkProps {
  value: string
  onChange(value: string): void
  className?: string
  label: string
  /** Shown, faintly, only while it is empty. Optional — the Stars has none. */
  placeholder?: string
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void
  /** Focus it as soon as it appears. */
  autoFocus?: boolean
  /** The element itself, for the places that put the cursor back. */
  innerRef?: RefObject<HTMLDivElement | null>
}

/**
 * The document's own text, which is not always what React last set.
 *
 * A contenteditable is uncontrolled by nature: the browser writes into it as
 * you type. Writing the value back on every render would move the caret to the
 * end on every keystroke, so it is only written when the two have genuinely
 * drifted — which happens when the caller clears the draft after sending, or
 * fills it in from somewhere else.
 */
function sync(el: HTMLDivElement, value: string) {
  if (el.textContent === value) return
  el.textContent = value
}

export function Ink({
  value,
  onChange,
  className,
  label,
  placeholder,
  onKeyDown,
  autoFocus,
  innerRef,
}: InkProps) {
  const own = useRef<HTMLDivElement>(null)
  const box = innerRef ?? own

  useEffect(() => {
    const el = box.current
    if (el) sync(el, value)
  }, [value])

  useEffect(() => {
    if (autoFocus) box.current?.focus()
  }, [autoFocus])

  return (
    <div
      ref={box}
      className={className}
      /*
        `plaintext-only` rather than `true`. Plain `contenteditable` lets a
        paste bring its own bold, its own colours and its own links into a
        message, and lets Return insert a `<div>`; this keeps it text, which is
        all a message has ever been.

        React does not know this attribute's casing, hence the string — and
        `suppressContentEditableWarning` because React is right in general that
        it should not be rendering children into an editable node, and wrong
        here, where the children are the value.
      */
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-empty={value === '' ? 'yes' : 'no'}
      data-placeholder={placeholder}
      // Everything the textarea carried, kept: these are honoured on editable
      // hosts too, and dropping them would change the keyboard.
      inputMode="text"
      enterKeyHint="enter"
      autoCorrect="on"
      autoCapitalize="sentences"
      spellCheck
      translate="no"
      onInput={(event) => onChange(event.currentTarget.textContent ?? '')}
      onKeyDown={onKeyDown}
      /*
        Paste is the one event that can still bring markup in — `plaintext-only`
        governs typing and the browser's own insertion, and Safari has shipped
        versions that still hand a rich fragment to a paste. Taking the plain
        text and inserting it ourselves is the only way to be sure.
      */
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(text))
        selection.collapseToEnd()
        onChange(event.currentTarget.textContent ?? '')
      }}
    />
  )
}
